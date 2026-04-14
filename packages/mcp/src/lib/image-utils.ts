import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TMP_DIR = join(tmpdir(), "vortex-screenshots");
let sessionCounter = 0;

export function ensureTmpDir(): string {
  try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  return TMP_DIR;
}

/**
 * 保存 base64 图片到临时文件，返回路径和字节数。
 */
export function saveBase64Image(dataUrl: string, prefix: string = "screenshot"): { path: string; bytes: number } {
  ensureTmpDir();
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const ext = match[1];
  const buf = Buffer.from(match[2], "base64");
  const path = join(TMP_DIR, `${prefix}-${Date.now()}-${++sessionCounter}.${ext}`);
  writeFileSync(path, buf);
  return { path, bytes: buf.length };
}

/**
 * 嗅探 PNG / JPEG 图片的宽高，不做解码。
 * 失败时返回 { width: 0, height: 0 }（不阻断流程）。
 */
export function getImageSize(dataUrl: string): { width: number; height: number } {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return { width: 0, height: 0 };
  try {
    const buf = Buffer.from(match[1], "base64");
    // PNG: bytes 16-23 = width, height (big-endian u32)
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height };
    }
    // JPEG: 扫描 SOF 标记
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        const segLen = buf.readUInt16BE(i + 2);
        if (marker === 0xc0 || marker === 0xc2) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          return { width, height };
        }
        i += 2 + segLen;
      }
    }
  } catch {}
  return { width: 0, height: 0 };
}

/**
 * 估算 base64 data URL 的原始字节数（不含 header）。
 */
export function estimateImageBytes(dataUrl: string): number {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return 0;
  return Math.floor(match[1].length * 0.75);
}
