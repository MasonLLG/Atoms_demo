import { describe, expect, it } from "vitest";
import { applyPatches, extractHtml, extractSummary, parsePatches } from "../../src/lib/agents/extract";
import { buildPreviewDoc } from "../../src/lib/runtime";

const DOC = "<!DOCTYPE html>\n<html>\n<head>\n<title>T</title>\n</head>\n<body>\n  <h1>Hello</h1>\n  <p>World</p>\n</body>\n</html>";

describe("extractHtml", () => {
  it("取出标记块中的 HTML", () => {
    const out = `SUMMARY: 做了一个页面\n<<<FILE index.html>>>\n${DOC}\n<<<END>>>`;
    expect(extractHtml(out)).toBe(DOC);
    expect(extractSummary(out)).toBe("做了一个页面");
  });

  it("去掉模型多包的一层 markdown 代码块", () => {
    expect(extractHtml(`<<<FILE index.html>>>\n\`\`\`html\n${DOC}\n\`\`\`\n<<<END>>>`)).toBe(DOC);
  });

  it("流式未结束时返回已写出的部分", () => {
    expect(extractHtml("<<<FILE index.html>>>\n<!DOCTYPE html><html>", false)).toBe("<!DOCTYPE html><html>");
  });

  it("没有标记时回退到 ```html 代码块或完整文档", () => {
    expect(extractHtml(`说明\n\`\`\`html\n${DOC}\n\`\`\``)).toBe(DOC);
    expect(extractHtml(`前言 ${DOC} 后记`)).toBe(DOC);
    expect(extractHtml("什么都没有")).toBeNull();
  });
});

describe("SEARCH/REPLACE 补丁", () => {
  const patchText = `SUMMARY: 改标题
<<<<<<< SEARCH
  <h1>Hello</h1>
=======
  <h1>你好</h1>
>>>>>>> REPLACE
<<<<<<< SEARCH
  <p>World</p>
=======
  <p>世界</p>
>>>>>>> REPLACE`;

  it("解析并应用多个补丁", () => {
    const patches = parsePatches(patchText);
    expect(patches).toHaveLength(2);
    const res = applyPatches(DOC, patches);
    expect(res.ok && res.html).toContain("<h1>你好</h1>");
    expect(res.ok && res.html).toContain("<p>世界</p>");
  });

  it("缩进不一致时宽松匹配", () => {
    const res = applyPatches(DOC, [{ search: "<h1>Hello</h1>\n<p>World</p>", replace: "  <h2>新</h2>" }]);
    expect(res.ok).toBe(true);
    expect(res.ok && res.html).toContain("<h2>新</h2>");
    expect(res.ok && res.html).not.toContain("World");
  });

  it("替换内容里的 $ 不会被当成正则引用", () => {
    const res = applyPatches(DOC, [{ search: "<p>World</p>", replace: "<p>$&价格 $1</p>" }]);
    expect(res.ok && res.html).toContain("<p>$&价格 $1</p>");
  });

  it("找不到原文时报告失败", () => {
    const res = applyPatches(DOC, [{ search: "<div>不存在</div>", replace: "x" }]);
    expect(res.ok).toBe(false);
  });
});

describe("buildPreviewDoc", () => {
  it("在 <head> 之后注入运行时，并转义种子数据中的 <", () => {
    const doc = buildPreviewDoc(DOC, { k: "</script><b>" });
    expect(doc.indexOf("__atoms_preview__")).toBeGreaterThan(doc.indexOf("<head>"));
    expect(doc.indexOf("__atoms_preview__")).toBeLessThan(doc.indexOf("<title>"));
    expect(doc).not.toContain('"</script><b>"');
  });
});
