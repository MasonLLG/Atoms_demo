// 解析工程师的非 JSON 输出：整文件块与 SEARCH/REPLACE 补丁块

export const FILE_START = "<<<FILE index.html>>>";
export const FILE_END = "<<<END>>>";

export function extractSummary(text: string): string {
  const m = text.match(/^\s*SUMMARY:\s*(.+)$/m);
  return m ? m[1].trim().slice(0, 200) : "";
}

/** 从（可能仍在流式输出中的）文本里取出 HTML。complete=false 时允许没有结束标记。 */
export function extractHtml(text: string, complete = true): string | null {
  const start = text.indexOf(FILE_START);
  if (start >= 0) {
    const body = text.slice(start + FILE_START.length);
    const end = body.indexOf(FILE_END);
    if (end >= 0) return cleanFence(body.slice(0, end));
    return complete ? fallbackHtml(text) : cleanFence(body);
  }
  return fallbackHtml(text);
}

function cleanFence(s: string) {
  return s.replace(/^\s*```(?:html)?\s*\n/, "").replace(/\n```\s*$/, "").trim();
}

function fallbackHtml(text: string): string | null {
  // 模型偶尔不按约定输出，退而求其次：取 ```html 代码块或 <!DOCTYPE ...</html>
  const fence = text.match(/```html\s*\n([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const doc = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  return doc ? doc[0].trim() : null;
}

export interface Patch {
  search: string;
  replace: string;
}

const PATCH_RE = /<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;

export function parsePatches(text: string): Patch[] {
  return [...text.matchAll(PATCH_RE)].map((m) => ({ search: m[1], replace: m[2] }));
}

export type PatchResult = { ok: true; html: string } | { ok: false; failed: string };

/** 依次应用补丁；精确匹配失败时尝试忽略行首尾空白的宽松匹配。 */
export function applyPatches(html: string, patches: Patch[]): PatchResult {
  let out = html;
  for (const p of patches) {
    if (p.search && out.includes(p.search)) {
      out = out.replace(p.search, () => p.replace);
      continue;
    }
    const loose = looseReplace(out, p);
    if (loose === null) return { ok: false, failed: p.search.slice(0, 120) };
    out = loose;
  }
  return { ok: true, html: out };
}

function looseReplace(src: string, p: Patch): string | null {
  const norm = (l: string) => l.trim();
  const srcLines = src.split("\n");
  const searchLines = p.search.split("\n").map(norm).filter((l) => l.length > 0);
  if (searchLines.length === 0) return null;
  for (let i = 0; i < srcLines.length; i++) {
    let j = 0;
    let k = i;
    while (k < srcLines.length && j < searchLines.length) {
      if (norm(srcLines[k]) === "") {
        k++;
        continue;
      }
      if (norm(srcLines[k]) !== searchLines[j]) break;
      j++;
      k++;
    }
    if (j === searchLines.length) {
      return [...srcLines.slice(0, i), p.replace, ...srcLines.slice(k)].join("\n");
    }
  }
  return null;
}
