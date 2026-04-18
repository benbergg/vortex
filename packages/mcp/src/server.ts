#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sendRequest } from "./client.js";
import { getToolDefs, getToolDef } from "./tools/registry.js";
import {
  saveBase64Image,
  getImageSize,
  estimateImageBytes,
} from "./lib/image-utils.js";
import { eventStore } from "./lib/event-store.js";
import type { VtxEventLevel } from "@bytenew/vortex-shared";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** 普通 tool response 附加 piggyback 事件 */
function withEvents(content: ContentItem[]): { content: ContentItem[] } {
  const events = eventStore.drain();
  if (events.length > 0) {
    content.push({
      type: "text",
      text: `[vortex-events] ${events.length} event(s) delivered:\n${JSON.stringify(events, null, 2)}`,
    });
  }
  return { content };
}

const PORT = parseInt(process.env.VORTEX_PORT ?? "6800");
const DEFAULT_TIMEOUT = parseInt(process.env.VORTEX_TIMEOUT_MS ?? "30000");
const LARGE_IMAGE_BYTES = 500_000;   // 超过 500KB 的图片默认切 file 模式
const RESPONSE_SIZE_LIMIT = 100_000; // 非图片响应 100KB 截断

const server = new Server(
  { name: "vortex", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const defs = getToolDefs();
  return {
    tools: defs.map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.schema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolDef = getToolDef(name);

  if (!toolDef) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    };
  }

  const params = (args ?? {}) as Record<string, unknown>;

  // 特殊 tool: events 订阅管理（MCP 本地状态，不经过 vortex-server）
  if (toolDef.action === "__mcp_events_subscribe__") {
    const subId = eventStore.subscribe({
      types: params.types as string[] | undefined,
      minLevel: params.minLevel as VtxEventLevel | undefined,
      tabId: params.tabId as number | undefined,
    });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          subscriptionId: subId,
          note: "Events will be piggybacked to subsequent tool responses in a `[vortex-events]` text item.",
        }, null, 2),
      }],
    };
  }

  if (toolDef.action === "__mcp_events_unsubscribe__") {
    const ok = eventStore.unsubscribe(params.subscriptionId as string);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ unsubscribed: ok }, null, 2),
      }],
    };
  }

  // 特殊 tool: vortex_ping（MCP 自身诊断）
  if (toolDef.action === "__mcp_ping__") {
    try {
      const resp = await sendRequest("tab.list", {}, PORT, undefined, 5000);
      const tabs = Array.isArray(resp.result) ? resp.result : [];
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "ok",
            vortexServer: `localhost:${PORT}`,
            tabCount: tabs.length,
            timeoutMs: DEFAULT_TIMEOUT,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `vortex-server unreachable at localhost:${PORT}.\n${err.message}\n\nTo start: cd /path/to/vortex && pnpm --filter @bytenew/vortex-server start`,
        }],
      };
    }
  }

  try {
    const { tabId, returnMode, timeout, ...rest } = params;
    const effectiveTimeout = (timeout as number) ?? DEFAULT_TIMEOUT;
    const resp = await sendRequest(
      toolDef.action,
      rest,
      PORT,
      tabId as number | undefined,
      effectiveTimeout,
    );

    // Action 执行错误
    if (resp.error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error [${resp.error.code}]: ${resp.error.message}`,
        }],
      };
    }

    // 图片返回（screenshot / element）
    if (toolDef.returnsImage && resp.result) {
      const result = resp.result as { dataUrl?: string; [k: string]: unknown };
      if (result.dataUrl) {
        const { width, height } = getImageSize(result.dataUrl);
        const bytes = estimateImageBytes(result.dataUrl);

        // 超大图自动切到 file 模式
        const mode =
          returnMode === "file" ||
          (returnMode !== "inline" && bytes > LARGE_IMAGE_BYTES)
            ? "file"
            : "inline";

        if (mode === "file") {
          const prefix = toolDef.action.replace(/\./g, "-");
          const { path, bytes: savedBytes } = saveBase64Image(result.dataUrl, prefix);
          return withEvents([{
            type: "text" as const,
            text: JSON.stringify({
              savedTo: path,
              width,
              height,
              bytes: savedBytes,
              note: "Image saved to file to conserve tokens. Use the Read tool with the savedTo path to view it.",
            }, null, 2),
          }]);
        }

        // inline 模式
        const m = result.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (m) {
          return withEvents([{
            type: "image" as const,
            data: m[2],
            mimeType: `image/${m[1]}`,
          }]);
        }
      }
    }

    // 普通响应 + 超大截断
    const resultText = JSON.stringify(resp.result ?? resp, null, 2);
    if (resultText.length > RESPONSE_SIZE_LIMIT) {
      const truncated = resultText.slice(0, RESPONSE_SIZE_LIMIT);
      return withEvents([{
        type: "text" as const,
        text: truncated + `\n\n[TRUNCATED: response was ${resultText.length} bytes, showing first ${RESPONSE_SIZE_LIMIT}. Use filter/pagination parameters for smaller responses.]`,
      }]);
    }

    return withEvents([{ type: "text" as const, text: resultText }]);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    let friendly = msg;
    if (msg.includes("ECONNREFUSED") || msg.includes("Failed to connect")) {
      friendly =
        `vortex-server is not running at localhost:${PORT}.\n` +
        `To start: cd /path/to/vortex && pnpm --filter @bytenew/vortex-server start\n\n` +
        `Run the 'vortex_ping' tool to re-check connectivity.\n\n` +
        `Original error: ${msg}`;
    } else if (msg.includes("Timeout")) {
      friendly =
        `${msg}\n\n` +
        `Possible causes:\n` +
        `- Tab is still loading (wait and retry, or use vortex_page_wait_for_network_idle)\n` +
        `- Extension not loaded/reloaded (check chrome://extensions)\n` +
        `- Native messaging disconnected (check vortex-server logs)\n` +
        `Set VORTEX_TIMEOUT_MS env var to override the ${DEFAULT_TIMEOUT}ms default.`;
    }
    return {
      isError: true,
      content: [{ type: "text" as const, text: friendly }],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start vortex MCP server:", err);
  process.exit(1);
});
