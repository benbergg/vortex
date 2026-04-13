export interface OutputOptions {
  pretty?: boolean;
  quiet?: boolean;
}

/**
 * 输出响应。
 * --quiet: 只输出 result
 * --pretty: 格式化 JSON
 * 默认: 一行 NDJSON
 */
export function printResponse(data: unknown, opts: OutputOptions): void {
  const output = opts.quiet && typeof data === "object" && data !== null
    ? (data as any).result ?? (data as any).error ?? data
    : data;

  if (opts.pretty) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(JSON.stringify(output));
  }
}

/**
 * 输出事件（subscribe --follow 模式）。
 */
export function printEvent(data: unknown, opts: OutputOptions): void {
  if (opts.pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

/**
 * 输出错误并退出。
 */
export function exitWithError(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
