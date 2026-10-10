// 未配置 API Key 时使用的离线演示模型：输出格式与真实模型完全一致，便于本地开发与测试
import { APIError } from "openai";
import { FILE_END, FILE_START } from "./extract";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickPrompt(user: string) {
  const m = user.match(/用户原始需求：(.+)/) || user.match(/用户的修改要求：(.+)/);
  return (m ? m[1] : user).trim().slice(0, 60);
}

// 仅离线演示模型生效：需求里带上这个标记时模拟上游 503，用于端到端测试错误处理与重试
export const MOCK_FAIL_MARKER = "[[模拟服务异常]]";

function maybeFail(user: string) {
  if (user.includes(MOCK_FAIL_MARKER)) {
    throw APIError.generate(503, { error: { message: "mock upstream unavailable" } }, "mock upstream unavailable", new Headers());
  }
}

export async function mockJson(system: string, user: string): Promise<string> {
  await sleep(600);
  maybeFail(user);
  if (system.includes("你是 Mike")) {
    const msg = (user.match(/用户的新消息：([\s\S]*)$/)?.[1] ?? user).trim();
    const chat = /^(你好|您好|hi|hello|在吗|嗨|你们能做什么)[!！。.？?]*$/i.test(msg) || /怎么用|是什么|为什么/.test(msg);
    return JSON.stringify(
      chat
        ? { intent: "chat", reply: "你好！我是 Mike（离线演示模型）。告诉我你想做什么应用吧，比如番茄钟、记账本或者贪吃蛇小游戏。" }
        : { intent: "build", reply: `明白，「${msg.slice(0, 30)}」，马上安排（离线演示模型）。` },
    );
  }
  if (system.includes("Emma")) {
    const p = user.trim().slice(0, 40);
    return JSON.stringify({
      appName: p.replace(/^(做|帮我做|创建|生成)(一个)?/, "").split(/[，,。]/)[0].slice(0, 12) || "我的应用",
      summary: `根据「${p}」生成的轻量网页应用`,
      targetUsers: "希望快速管理日常事项的个人用户",
      features: [
        { name: "新增条目", description: "输入内容后添加到列表", priority: "P0" },
        { name: "完成与删除", description: "勾选完成、删除条目", priority: "P0" },
        { name: "筛选统计", description: "按状态筛选并显示统计", priority: "P1" },
      ],
      pages: [{ name: "主页", purpose: "展示与管理全部条目" }],
      dataModel: [{ entity: "Item", fields: ["id", "text", "done", "createdAt"] }],
    });
  }
  if (system.includes("recommendations")) {
    return JSON.stringify({
      summary: "已从我的专业角度给出建议（离线演示模型）",
      recommendations: ["按钮增加悬停与点击反馈", "空状态给出引导文案"],
    });
  }
  return JSON.stringify({
    style: { theme: "简洁浅色", primaryColor: "#6366f1", layout: "居中单栏卡片布局" },
    components: [
      { name: "Header", responsibility: "标题与统计" },
      { name: "ItemForm", responsibility: "新增条目" },
      { name: "ItemList", responsibility: "列表渲染、完成与删除" },
    ],
    stateShape: "{ items: { id: string; text: string; done: boolean; createdAt: number }[]; filter: 'all'|'todo'|'done' }",
    storageKeys: ["mock-app:items"],
    implementationNotes: ["状态变化后统一 render() 并写入 localStorage"],
  });
}

export async function mockStream(system: string, user: string, onDelta: (t: string) => void): Promise<string> {
  maybeFail(user);
  const isEdit = system.includes("SEARCH/REPLACE") && !system.includes("输出修改后的完整文件");
  const prompt = pickPrompt(user);
  const text = isEdit ? mockPatch(prompt) : `SUMMARY: 完成了「${prompt}」的第一版（离线演示模型）\n${FILE_START}\n${mockHtml(prompt)}\n${FILE_END}`;
  for (let i = 0; i < text.length; i += 80) {
    onDelta(text.slice(i, i + 80));
    await sleep(8);
  }
  return text;
}

function mockPatch(prompt: string) {
  return `SUMMARY: 已根据「${prompt}」更新页脚说明
<<<<<<< SEARCH
<footer id="foot" class="text-center text-xs text-slate-400 mt-6">离线演示模型生成</footer>
=======
<footer id="foot" class="text-center text-xs text-slate-400 mt-6">已更新：${prompt.replace(/[<>]/g, "")}</footer>
>>>>>>> REPLACE`;
}

function mockHtml(prompt: string) {
  const title = prompt.replace(/[<>"]/g, "").slice(0, 20) || "我的应用";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 min-h-screen">
<main class="max-w-xl mx-auto p-6">
  <h1 class="text-2xl font-bold text-slate-800">${title}</h1>
  <p id="stats" class="text-sm text-slate-500 mt-1"></p>
  <form id="form" class="flex gap-2 mt-4">
    <input id="input" class="flex-1 rounded-lg border border-slate-200 px-3 py-2" placeholder="添加一条..." />
    <button class="rounded-lg bg-indigo-500 text-white px-4">添加</button>
  </form>
  <ul id="list" class="mt-4 space-y-2"></ul>
  <footer id="foot" class="text-center text-xs text-slate-400 mt-6">离线演示模型生成</footer>
</main>
<script>
  const KEY = "mock-app:items";
  let items = JSON.parse(localStorage.getItem(KEY) || "null") || [
    { id: 1, text: "体验 Atoms Demo", done: true },
    { id: 2, text: "让 Alex 修改界面", done: false },
  ];
  const save = () => localStorage.setItem(KEY, JSON.stringify(items));
  function render() {
    document.getElementById("stats").textContent = "共 " + items.length + " 项，已完成 " + items.filter(i => i.done).length + " 项";
    const list = document.getElementById("list");
    list.innerHTML = "";
    items.forEach(it => {
      const li = document.createElement("li");
      li.className = "flex items-center gap-3 bg-white rounded-lg shadow-sm px-3 py-2";
      li.innerHTML = '<input type="checkbox" ' + (it.done ? "checked" : "") + ' /><span class="flex-1 ' + (it.done ? "line-through text-slate-400" : "") + '"></span><button class="text-slate-400 hover:text-red-500">删除</button>';
      li.querySelector("span").textContent = it.text;
      li.querySelector("input").onchange = () => { it.done = !it.done; save(); render(); };
      li.querySelector("button").onclick = () => { items = items.filter(x => x !== it); save(); render(); };
      list.appendChild(li);
    });
  }
  document.getElementById("form").onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById("input").value.trim();
    if (!v) return;
    items.push({ id: Date.now(), text: v, done: false });
    document.getElementById("input").value = "";
    save(); render();
  };
  render();
</script>
</body>
</html>`;
}
