// Agent 运行 trace：记录每一步的 timestamp + 类型化事件，供报告/判定使用。

export type TraceEvent =
  | { kind: "user"; text: string; at: number }
  | { kind: "assistant_text"; text: string; at: number }
  | {
      kind: "tool_call";
      name: string;
      args: unknown;
      at: number;
    }
  | {
      kind: "tool_result";
      name: string;
      isError: boolean;
      resultText: string;
      errorCodes: string[];
      at: number;
    }
  | {
      kind: "usage";
      inputTokens: number;
      outputTokens: number;
      at: number;
    }
  | {
      kind: "terminate";
      reason: string;
      at: number;
    };

export class Trace {
  readonly events: TraceEvent[] = [];

  push(ev: TraceEvent): void {
    this.events.push(ev);
  }

  now(): number {
    return Date.now();
  }
}

/** 从 tool_result 文本里提取 VtxError 的 code 字段（若存在）。 */
export function extractErrorCodes(text: string): string[] {
  const out: string[] = [];
  const re = /"code"\s*:\s*"([A-Z_][A-Z0-9_]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}
