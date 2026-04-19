/**
 * 按 Unicode code point 切分（避免切坏 UTF-16 代理对 / emoji）。
 * String.prototype.slice 按 code unit 切，对超 BMP 字符会产生 lone surrogate。
 */
export function truncateByCodePoints(text: string, limit: number): string {
  if (limit <= 0) return "";
  if (text.length <= limit) return text;
  const codePoints = [...text];
  if (codePoints.length <= limit) return text;
  return codePoints.slice(0, limit).join("");
}
