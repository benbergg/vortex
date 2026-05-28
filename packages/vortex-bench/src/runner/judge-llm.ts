// packages/vortex-bench/src/runner/judge-llm.ts
// I/O:Anthropic 视觉 API 客户端。无 ANTHROPIC_API_KEY 时干净抛错,不崩溃。
// 调用一次 messages.create(截图 image block + prompt 文本) → 原始文本响应(交给 judge-parse 解析)。

import Anthropic from "@anthropic-ai/sdk";

/** 调用判官时传入的截图数据 */
export interface JudgeImage {
  /** base64 编码的图像数据 */
  base64: string;
  /** MIME 类型,如 "image/jpeg" 或 "image/png" */
  mimeType: string;
}

/** callJudge 的入参 */
export interface CallJudgeOptions {
  /** 模型名,由编排层(T8/T9)决定,此文件不设默认值 */
  model: string;
  /** 判官 prompt 文本(由 judge-prompt.ts 生成) */
  prompt: string;
  /** 截图 */
  image: JudgeImage;
  /** 可选覆盖 ANTHROPIC_API_KEY 环境变量 */
  apiKey?: string;
}

/**
 * 调一次 Anthropic 多模态判官,返回原始文本响应。
 * 响应由 judge-parse.ts 解析为 ClaimedMiss[]。
 * media_type 按 SDK Base64ImageSource 联合类型窄化:
 *   "image/jpeg" | "image/png" | "image/gif" | "image/webp"
 */
export async function callJudge(opts: CallJudgeOptions): Promise<string> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("[judge-llm] 缺少 ANTHROPIC_API_KEY 环境变量,judge 子命令需要此 key");
  }

  const client = new Anthropic({ apiKey });

  // media_type 须符合 SDK Base64ImageSource 联合类型
  const mediaType = opts.image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const msg = await client.messages.create({
    model: opts.model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: opts.image.base64,
            },
          },
          { type: "text", text: opts.prompt },
        ],
      },
    ],
  });

  // 取第一个 text block 的文本;若响应无文本 block 返回空串
  const textBlock = msg.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? (textBlock as { type: "text"; text: string }).text : "";
}
