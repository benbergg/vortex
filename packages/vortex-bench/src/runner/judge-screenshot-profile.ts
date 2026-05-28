// 截图 profile 抽象:把"截图参数 + 后处理"作为 first-class 配置对象
// 设计文档 §3.2

export type ScreenshotProfile = {
  /** profile 名称,用于 CLI flag + 报告文件命名 */
  name: string;
  format: "jpeg" | "png";
  /** jpeg 时 1-100;png 时省略 */
  quality?: number;
  /** CDP Emulation.setDeviceMetricsOverride 用;1 表示不 override */
  deviceScaleFactor: 1 | 2;
  /** d 杠杆:是否对每个 iframe/srcdoc 单独截图后多图喂模型 */
  perFrame: boolean;
};

export const PROFILES: Record<string, ScreenshotProfile> = {
  "q70":                    { name: "q70",                    format: "jpeg", quality: 70, deviceScaleFactor: 1, perFrame: false },
  "q85":                    { name: "q85",                    format: "jpeg", quality: 85, deviceScaleFactor: 1, perFrame: false },
  "q85+dpr2":               { name: "q85+dpr2",               format: "jpeg", quality: 85, deviceScaleFactor: 2, perFrame: false },
  "q85+dpr2+png":           { name: "q85+dpr2+png",           format: "png",               deviceScaleFactor: 2, perFrame: false },
  "q85+dpr2+png+per-frame": { name: "q85+dpr2+png+per-frame", format: "png",               deviceScaleFactor: 2, perFrame: true  },
};

export function resolveProfile(name: string | undefined): ScreenshotProfile {
  if (!name) return PROFILES.q70;
  const p = PROFILES[name];
  if (!p) {
    throw new Error(`unknown screenshot profile: ${name}; known: ${Object.keys(PROFILES).join(", ")}`);
  }
  return p;
}

/**
 * 当 DPR > 1 时往判官 system prompt 追加坐标系说明:
 * 截图是 device px 渲染,observe bbox 仍是 CSS px。
 */
export function profilePromptHint(p: ScreenshotProfile): string {
  if (p.deviceScaleFactor === 2) {
    return "Screenshot rendered at deviceScaleFactor=2 (Retina). All coordinates in observe table are CSS pixels (frame-local viewport). Bbox numbers refer to CSS px, not device px.";
  }
  return "";
}
