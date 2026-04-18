// Provider 路由：根据 env 挑选 LLM 服务商 + 默认 baseURL / 模型 / 鉴权方式。
// 所有 provider 都走 Anthropic Messages API（Claude 官方、Zhipu bigmodel、MiniMax 都有兼容端点）。

export type Provider = "zhipu" | "anthropic" | "minimax";

export interface ProviderConfig {
  provider: Provider;
  baseURL: string;
  model: string;
  /** Bearer 鉴权（Authorization header） */
  authToken?: string;
  /** x-api-key 鉴权（仅 Anthropic 官方） */
  apiKey?: string;
}

const DEFAULT_BASE_URL: Record<Provider, string> = {
  zhipu: "https://open.bigmodel.cn/api/anthropic",
  anthropic: "https://api.anthropic.com",
  minimax: "https://api.minimax.io/anthropic",
};

const DEFAULT_MODEL: Record<Provider, string> = {
  zhipu: "glm-4.7",
  anthropic: "claude-haiku-4-5-20251001",
  minimax: "MiniMax-M2.7",
};

function pickAutoProvider(): Provider {
  // 优先 Zhipu（我们目前可用的 domestic），再 Anthropic 官方，再 MiniMax
  if (process.env.ZHIPU_API_KEY) return "zhipu";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.MINIMAX_API_KEY) return "minimax";
  throw new Error(
    "[vortex-bench] No provider key found. Set one of ZHIPU_API_KEY / ANTHROPIC_API_KEY / MINIMAX_API_KEY.",
  );
}

function readKeyFor(provider: Provider): string {
  const table: Record<Provider, string> = {
    zhipu: "ZHIPU_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    minimax: "MINIMAX_API_KEY",
  };
  const envVar = table[provider];
  const key = process.env[envVar];
  if (!key) {
    throw new Error(`[vortex-bench] ${envVar} not set but BENCH_PROVIDER=${provider}`);
  }
  return key;
}

export function resolveProvider(): ProviderConfig {
  const explicit = process.env.BENCH_PROVIDER as Provider | undefined;
  const provider: Provider = explicit ?? pickAutoProvider();

  if (!["zhipu", "anthropic", "minimax"].includes(provider)) {
    throw new Error(`[vortex-bench] unknown BENCH_PROVIDER: ${provider}`);
  }

  const key = readKeyFor(provider);
  const baseURL = process.env.BENCH_BASE_URL ?? DEFAULT_BASE_URL[provider];
  const model = process.env.BENCH_MODEL ?? DEFAULT_MODEL[provider];

  const cfg: ProviderConfig = { provider, baseURL, model };
  if (provider === "anthropic") {
    cfg.apiKey = key;
  } else {
    cfg.authToken = key;
  }
  return cfg;
}
