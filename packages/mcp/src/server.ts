#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { watch } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sendRequest } from "./client.js";
import { getToolDefs, getToolDef } from "./tools/registry.js";

const require_ = createRequire(import.meta.url);
const MCP_VERSION: string = (require_("../../package.json") as { version: string }).version;

/**
 * 计算当前 MCP 注册的所有工具指纹。
 * 变更任一工具 name / action / description 都会影响 hash。
 * 代理拿到 ping 响应里的 schemaHash 可对比自己缓存的版本，
 * 判断 MCP server 是否被重启过（典型场景：merge 了新 PR 但 Claude Code 还没重启）。
 */
function computeSchemaHash(): string {
  const defs = getToolDefs();
  const payload = defs.map((d) => `${d.name}:${d.action}:${d.description.length}`).sort().join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}
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

let activeSnapshotId: string | null = null;

const PORT = parseInt(process.env.VORTEX_PORT ?? "6800");
const DEFAULT_TIMEOUT = parseInt(process.env.VORTEX_TIMEOUT_MS ?? "30000");
const LARGE_IMAGE_BYTES = 500_000;   // 超过 500KB 的图片默认切 file 模式
const RESPONSE_SIZE_LIMIT = 100_000; // 非图片响应 100KB 截断

/**
 * 自重启机制（@since 0.4.0）：
 *
 * MCP server 作为 Claude Code 的 stdio 子进程长驻，每次 `pnpm -r build` 刷新 dist
 * 后，若 server 不重启，Claude 就永远看不到新工具 schema（典型踩坑）。
 *
 * 方案：watch 自身所在 dist 目录，`.js` 变更即标记 pendingRestart，等 inflight
 * 请求归零后 `process.exit(0)`。Claude Code 的 MCP stdio client 在子进程退出后
 * 下次 tool_call 触发自动 respawn，读到最新 schema。
 *
 * 关键安全点：
 *  - 必须等 inflight=0 才 exit，否则正在处理的请求会丢响应。
 *  - 不 watch src/（只 watch dist/），避免 dev 模式频繁误触发。
 *  - VORTEX_MCP_NO_AUTO_RESTART=1 提供 opt-out（CI 环境可关闭）。
 */
let inflight = 0;
let pendingRestart = false;
const AUTO_RESTART = process.env.VORTEX_MCP_NO_AUTO_RESTART !== "1";

function maybeExitAfterDrain(): void {
  if (pendingRestart && inflight === 0) {
    process.stderr.write(
      "[vortex-mcp] dist changed and inflight drained; exiting for Claude Code to respawn with fresh schema.\n",
    );
    // setImmediate 给 stderr 一次 flush 机会
    setImmediate(() => process.exit(0));
  }
}

function installAutoRestart(): void {
  if (!AUTO_RESTART) return;
  // __dirname 等价：本文件所在目录（dist/src/ 在运行期，src/ 在测试期——后者 fs.watch 也能跑）
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const watcher = watch(here, { recursive: true }, (eventType, filename) => {
      if (eventType !== "change" && eventType !== "rename") return;
      if (!filename || !filename.endsWith(".js")) return;
      if (pendingRestart) return; // already armed
      pendingRestart = true;
      process.stderr.write(
        `[vortex-mcp] dist file changed (${filename}); will exit after current requests drain.\n`,
      );
      maybeExitAfterDrain();
    });
    watcher.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[vortex-mcp] fs.watch failed: ${msg}; auto-restart disabled.\n`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[vortex-mcp] fs.watch init failed: ${msg}; auto-restart disabled.\n`);
  }
}

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
  inflight++;
  try {
    return await handleCallTool(request);
  } finally {
    inflight--;
    maybeExitAfterDrain();
  }
});

async function handleCallTool(
  request: { params: { name: string; arguments?: unknown } },
): Promise<{ content: ContentItem[]; isError?: boolean }> {
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
    return withEvents([{
      type: "text" as const,
      text: JSON.stringify({
        subscriptionId: subId,
        note: "Events will be piggybacked to subsequent tool responses in a `[vortex-events]` text item.",
      }, null, 2),
    }]);
  }

  if (toolDef.action === "__mcp_events_unsubscribe__") {
    const ok = eventStore.unsubscribe(params.subscriptionId as string);
    return withEvents([{
      type: "text" as const,
      text: JSON.stringify({ unsubscribed: ok }, null, 2),
    }]);
  }

  // 特殊 tool: events drain（强制 flush dispatcher + 拉 eventStore buffer）
  if (toolDef.action === "__mcp_events_drain__") {
    let flushed: { notice: number; info: number } = { notice: 0, info: 0 };
    try {
      const resp = await sendRequest("events.drain", {}, PORT, undefined, 5000);
      const result = (resp.result ?? {}) as { flushed?: { notice: number; info: number } };
      if (result.flushed) flushed = result.flushed;
    } catch (err) {
      // flush 失败仍尝试 drain 本地 buffer（可能已有之前 ingest 的事件）
      const msg = err instanceof Error ? err.message : String(err);
      const events = eventStore.drain();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ events, flushed, note: `flush failed: ${msg}` }, null, 2),
        }],
      };
    }
    // 顺序保证：ws FIFO → extension 的 dispatcher.flushAll 发出的 events
    // 在 action response 之前到达 mcp 端，此时已经 ingest 到 eventStore
    const events = eventStore.drain();
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ events, flushed }, null, 2),
      }],
    };
  }

  // 特殊 tool: vortex_ping（MCP 自身诊断 + 版本指纹，@since 0.4.0）
  if (toolDef.action === "__mcp_ping__") {
    try {
      const [tabsResp, versionResp] = await Promise.allSettled([
        sendRequest("tab.list", {}, PORT, undefined, 5000),
        sendRequest("diagnostics.version", {}, PORT, undefined, 5000),
      ]);
      const tabs =
        tabsResp.status === "fulfilled" && Array.isArray(tabsResp.value.result)
          ? tabsResp.value.result
          : [];
      const versionInfo =
        versionResp.status === "fulfilled"
          ? (versionResp.value.result as {
              extensionVersion?: string;
              actionCount?: number;
              actions?: string[];
            } | undefined) ?? {}
          : {};
      const toolCount = getToolDefs().length;
      const schemaHash = computeSchemaHash();

      // 版本漂移检测：MCP 与扩展的语义主版本不一致时给出明显提示。
      const extVersion = versionInfo.extensionVersion;
      const versionDrift =
        extVersion && extVersion !== "unknown" && extVersion !== MCP_VERSION
          ? `MCP (${MCP_VERSION}) ≠ extension (${extVersion}). Rebuild + reload may be needed.`
          : undefined;
      // 扩展太旧时，它汇报的 actions 不会包含 diagnostics.version，此时 versionInfo 为空。
      const diagnosticsSupported = typeof extVersion === "string";

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "ok",
            vortexServer: `localhost:${PORT}`,
            tabCount: tabs.length,
            timeoutMs: DEFAULT_TIMEOUT,
            mcpVersion: MCP_VERSION,
            extensionVersion: extVersion ?? "unknown",
            schemaHash,
            toolCount,
            extensionActionCount: versionInfo.actionCount ?? null,
            diagnosticsSupported,
            ...(versionDrift ? { warning: versionDrift } : {}),
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

  // observe.snapshot 专用分发：compact → 紧凑文本，full → 原 JSON pretty
  if (toolDef.action === "observe.snapshot") {
    const detail = (params.detail as "compact" | "full") ?? "compact";
    const { tabId, timeout, ...rest } = params;
    const effectiveTimeout = (timeout as number) ?? DEFAULT_TIMEOUT;
    // 把 MCP 的 detail 翻译成 extension handler 内部的 format 字段
    const resp = await sendRequest(
      toolDef.action,
      { ...rest, format: detail },
      PORT,
      tabId as number | undefined,
      effectiveTimeout,
    );
    if (resp.error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error [${resp.error.code}]: ${resp.error.message}` }],
      };
    }
    // 追踪活跃 snapshotId，供后续动作工具 target 翻译使用
    const snapshotResult = resp.result as { snapshotId?: string };
    if (snapshotResult?.snapshotId) activeSnapshotId = snapshotResult.snapshotId;
    if (detail === "compact") {
      const { renderObserveCompact } = await import("./lib/observe-render.js");
      const text = renderObserveCompact(resp.result as any);
      return withEvents([{ type: "text" as const, text }]);
    }
    // detail=full：原 JSON pretty（与 v0.4 行为一致）
    const resultText = JSON.stringify(resp.result ?? resp, null, 2);
    return withEvents([{ type: "text" as const, text: resultText }]);
  }

  // target 翻译：@eN / @fNeM → { index, snapshotId, frameId }
  const target = params.target as string | undefined;
  if (target) {
    try {
      const { resolveTargetParam } = await import("./lib/ref-parser.js");
      const resolved = resolveTargetParam(target, activeSnapshotId);
      delete params.target;
      if (resolved.selector) params.selector = resolved.selector;
      if (resolved.index != null) {
        params.index = resolved.index;
        params.snapshotId = resolved.snapshotId;
        // 跨 frame 时透传 frameId（frameId === 0 表示主 frame，不设即可）
        if (resolved.frameId && resolved.frameId !== 0) params.frameId = resolved.frameId;
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: (err as Error).message }],
      };
    }
  }

  // frameRef 翻译：@fN → frameId
  const frameRef = params.frameRef as string | undefined;
  if (frameRef) {
    const m = frameRef.match(/^@f(\d+)$/);
    if (!m) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Invalid frameRef: ${frameRef} (expected @fN)` }],
      };
    }
    delete params.frameRef;
    params.frameId = parseInt(m[1], 10);
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
      const code = resp.error.code;
      const hint = code === "STALE_SNAPSHOT"
        ? "\nHint: DOM 已变更，ref 失效。请重新调用 vortex_observe 获取新 snapshot。"
        : "";
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error [${code}]: ${resp.error.message}${hint}`,
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
}

async function main(): Promise<void> {
  installAutoRestart();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start vortex MCP server:", err);
  process.exit(1);
});
