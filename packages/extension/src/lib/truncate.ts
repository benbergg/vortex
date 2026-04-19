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

const HINT = "Call vortex_observe first for a structured index on large pages.";

/**
 * 截断纯文本并附加纯文本 trailer。用于 vortex_content_get_text。
 */
export function truncateWithTextTrailer(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const original = text.length;
  const truncated = truncateByCodePoints(text, limit);
  return `${truncated}\n\n[VORTEX_TRUNCATED original=${original} limit=${limit}] ${HINT}`;
}

/**
 * 截断 HTML 并附加 HTML comment trailer（保证返回仍是合法 HTML 片段）。
 * 用于 vortex_content_get_html。
 */
export function truncateWithHtmlTrailer(html: string, limit: number): string {
  if (html.length <= limit) return html;
  const original = html.length;
  const truncated = truncateByCodePoints(html, limit);
  return `${truncated}\n<!-- [VORTEX_TRUNCATED original=${original} limit=${limit}] ${HINT} -->`;
}
