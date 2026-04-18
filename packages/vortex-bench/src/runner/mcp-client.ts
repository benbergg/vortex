// MCP stdio client wrapper：spawn vortex-mcp binary，拉 tool 列表，统一 callTool。

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Tool[];
}

export interface CreateMcpOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function createMcpConnection(
  options: CreateMcpOptions,
): Promise<McpConnection> {
  const client = new Client({ name: "vortex-bench", version: "0.2.0-beta.1" });

  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args ?? [],
    env: options.env,
  });

  await client.connect(transport);

  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.listTools(cursor ? { cursor } : {});
    tools.push(...res.tools);
    cursor = res.nextCursor;
  } while (cursor);

  return { client, transport, tools };
}

export async function closeMcpConnection(conn: McpConnection): Promise<void> {
  try {
    await conn.client.close();
  } catch {
    // swallow: 进程已退出/管道关闭等情况不应影响上层
  }
}
