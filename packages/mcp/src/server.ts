#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sendRequest } from "./client.js";
import { getToolDefs, getToolDef } from "./tools/registry.js";

const PORT = parseInt(process.env.VORTEX_PORT ?? "6800");

const server = new Server(
  { name: "vortex", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// tools/list — 返回所有 tool 定义
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

// tools/call — 调用 tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolDef = getToolDef(name);

  if (!toolDef) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    };
  }

  try {
    const params = (args ?? {}) as Record<string, unknown>;
    // 提取 tabId 用于路由，其余作为 action params
    const { tabId, ...rest } = params;
    const resp = await sendRequest(
      toolDef.action,
      rest,
      PORT,
      tabId as number | undefined,
    );

    // 错误响应
    if (resp.error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error [${resp.error.code}]: ${resp.error.message}` }],
      };
    }

    // screenshot 类：返回 image content
    if (toolDef.returnsImage && resp.result) {
      const result = resp.result as { dataUrl?: string };
      if (result.dataUrl) {
        const match = result.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          return {
            content: [{
              type: "image" as const,
              data: match[2],
              mimeType: `image/${match[1]}`,
            }],
          };
        }
      }
    }

    // 普通响应
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(resp.result ?? resp, null, 2),
      }],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Connection error: ${err.message}` }],
    };
  }
});

// 启动 stdio transport
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start vortex MCP server:", err);
  process.exit(1);
});
