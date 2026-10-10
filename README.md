# Atoms Demo

用一句话描述需求，一支 AI 团队（团队负责人、产品经理、架构师、工程师）协作生成可运行的网页应用，并在浏览器里实时预览、对话迭代、版本回滚、一键发布。

- 在线体验：部署后填写
- 技术栈：Next.js 15（App Router）· React 19 · TypeScript · Tailwind CSS 4 · Supabase（Auth + Postgres + RLS）· DeepSeek（OpenAI 兼容协议）· Vercel

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 账号 | 邮箱注册与登录，未登录访问工作台或编辑器会被中间件拦截 |
| 工作台 | 输入需求或选模板一键创建项目，项目卡片带实时缩略图，支持删除 |
| 多智能体生成 | Mike 分派任务 → Emma 输出结构化需求文档 → Bob 输出结构化技术方案 → Alex 流式编写代码 |
| 实时预览 | 代码边写边渲染，沙箱 iframe 隔离运行，支持桌面与手机尺寸切换 |
| 对话迭代 | 继续用自然语言提修改，工程师输出 SEARCH/REPLACE 增量补丁，补丁打不上时自动回退为整文件重写 |
| 生成应用的数据持久化 | 生成的应用可以照常使用 localStorage，数据按项目隔离保存，刷新不丢 |
| 版本管理 | 每次生成、手动编辑、恢复都会存一个完整快照，可查看任意历史版本并恢复 |
| 代码编辑 | 内置 Monaco 编辑器，手动修改后保存为新版本 |
| 错误自愈 | 预览中捕获运行时错误，一键交给工程师修复 |
| 发布与 Remix | 一键发布得到公开链接 `/p/{slug}`，任何人可访问；登录用户可 Remix 到自己的工作区继续改 |
| 导出 | 下载当前版本的单文件 HTML |

## 架构

```
浏览器
 ├─ 首页 / 登录注册（Supabase Auth）
 ├─ 工作台（项目增删查，直接用 Supabase SDK，受 RLS 保护）
 └─ 编辑器
     ├─ 对话区：多智能体消息流 + PRD / 技术方案卡片
     ├─ 代码区：Monaco
     └─ 预览区：sandbox iframe + 预览运行时

Next.js 服务端（Vercel）
 └─ POST /api/generate   多智能体编排，SSE 流式推送（API Key 只存在服务端）

Supabase Postgres
 ├─ projects   项目、当前版本指针、发布状态
 ├─ versions   完整代码快照
 └─ messages   对话记录，结构化产物存 jsonb
```

只有调用 LLM 的生成接口走服务端，项目管理、版本恢复、发布、Remix 都由前端直接通过 Supabase SDK 完成，由行级权限（RLS）保证只能操作自己的数据。表结构见 [`supabase/schema.sql`](supabase/schema.sql)。

### 智能体编排

| 角色 | 输入 | 输出 | 形式 |
| --- | --- | --- | --- |
| Mike 团队负责人 | 用户需求 | 任务分派说明 | 固定文案，不调用模型 |
| Emma 产品经理 | 用户需求 | 应用名、目标用户、功能与优先级、页面、数据模型 | JSON（zod 校验） |
| Bob 架构师 | 需求 + PRD | 视觉风格、模块划分、状态结构、存储 key、实现要点 | JSON（zod 校验） |
| Alex 工程师（首次） | 需求 + PRD + 技术方案 | 完整单文件 HTML | 分隔标记包裹的纯文本，流式 |
| Alex 工程师（迭代） | 当前代码 + 最近对话 + 修改要求 | SEARCH/REPLACE 补丁 | 纯文本，流式 |

### 结构化输出的取舍

- **规划类产出用 JSON**：zod schema 是唯一事实来源，`z.toJSONSchema` 生成给模型看的 Schema，配合 DeepSeek 的 JSON 模式输出，服务端再用同一个 schema 校验。校验失败时把错误信息回传给模型重试一次。
- **代码不放进 JSON**：把几十 KB 的 HTML 塞进 JSON 字符串，引号和换行转义很容易出错，也没法边生成边预览。所以工程师用 `<<<FILE index.html>>> … <<<END>>>` 标记包裹代码，解析器同时兼容模型偶尔多包一层 markdown 代码块、或者完全没按格式输出的情况。
- **迭代用补丁**：输出量小、速度快。补丁先精确匹配，再做忽略缩进的宽松匹配，都失败时自动回退为整文件重写。
- **前后端事件协议**：`meta` / `agent_start` / `delta` / `agent_done` / `status` / `project` / `version_saved` / `error` / `done`，定义在 [`src/lib/agents/events.ts`](src/lib/agents/events.ts)。

### 预览沙箱

生成的代码运行在 `sandbox="allow-scripts ..."` 的 iframe 中，**不加** `allow-same-origin`，拿不到主站的 Cookie 和登录态。代价是 iframe 里原生的 localStorage 不可用。解决办法是在 `<head>` 最前面注入一段预览运行时（[`src/lib/runtime.ts`](src/lib/runtime.ts)），它做两件事：

1. 用一个 Storage 替身接管 `localStorage`，写入时通过 `postMessage` 交给父页面按项目持久化，下次打开时再作为种子数据注入。生成的应用不需要任何改动就能持久化数据。
2. 捕获 `error` 和 `unhandledrejection` 并回传给编辑器，驱动"让 Alex 修复"。

## 关键取舍

- **生成物限定为单文件 HTML**（Tailwind CDN + 原生 JS）。不做多文件工程和在线构建（如 WebContainer），优先保证几十秒内稳定出结果，预览和发布也都只是一个页面。
- **顺序流水线，不做自主规划循环**。每一步可观察、耗时可预期、出错好定位。
- **版本存全量快照**。单文件通常只有 10 到 40 KB，查看、回滚、发布都是一次读取。回滚等于把旧版本复制成新版本，历史只追加、不改写。
- **生成应用的数据存在浏览器里**，不为任意应用设计通用的后端存储，复杂度可控。
- **成本控制**：每个用户 24 小时内的生成次数有上限（`DAILY_GENERATION_LIMIT`，默认 40）。

## 完成度

已完成：
- 注册登录、项目增删查、多智能体流式生成、实时预览、对话迭代、版本历史与恢复、手动编辑、发布分享、Remix、运行错误一键修复、导出 HTML、手机尺寸预览、移动端布局
- 解析器单元测试（Vitest，9 项），以及覆盖"注册 → 生成 → 数据持久化 → 迭代 → 回滚 → 发布 → 匿名访问 → Remix"的端到端测试（Playwright）

未完成：
- 生成多文件 / React 工程
- 图片、截图作为需求输入
- 协作编辑与评论
- 自定义域名发布

## 如果继续投入，按优先级

1. **生成质量**：在工程师之后加一个 QA 智能体，用无头浏览器打开预览、截图并检查报错，自动修复后再交付。现在的"一键修复"需要用户手动触发。
2. **可视化编辑**：在预览里点选元素直接提修改（把元素的选择器和上下文带进提示词），比纯文字描述更精确。
3. **多文件工程**：引入 WebContainer 或服务端构建，支持 React 等框架和 npm 依赖，以及一键部署到 Vercel 或 Netlify。
4. **生成应用的云端数据**：为生成的应用提供一个按项目隔离的 KV 或表存储 API，让发布出去的应用也能多人共享数据。
5. **模板市场**：已发布的应用可以按热度展示，Remix 次数作为排序信号。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入 Supabase 和 DeepSeek 配置
npm run dev
```

1. 在 Supabase 控制台的 SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)，可以重复执行。
2. 在 Authentication → Sign In / Providers → Email 关闭 **Confirm email**，注册后即可直接登录。
3. 不配置 `DEEPSEEK_API_KEY`（或设置 `LLM_MOCK=1`）时，会使用离线演示模型。它的输出格式和真实模型一致，不消耗 token 就能跑通全流程，编辑器顶部会显示"离线演示模型"标记。

### 测试

```bash
npm test             # 单元测试
npm run build
npm run test:e2e     # 端到端测试，需要可用的 Supabase 和 LLM_MOCK=1
```

## 部署（Vercel）

1. 在 Vercel 导入本仓库，框架选 Next.js。
2. 配置环境变量 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`DEEPSEEK_API_KEY`。
3. 部署完成后，在 Supabase 的 Authentication → URL Configuration 把 Site URL 设为线上域名。

生成接口声明了 `maxDuration = 300`，并通过 SSE 持续推送，长时间生成不会被中途断开。

## 目录结构

```
src/
├─ app/
│  ├─ page.tsx                 首页
│  ├─ login/                   登录注册
│  ├─ dashboard/               工作台
│  ├─ project/[id]/            编辑器
│  ├─ p/[slug]/                公开访问与 Remix
│  └─ api/generate/route.ts    SSE 生成接口
├─ components/                 预览、代码编辑器、对话气泡、卡片等
├─ lib/
│  ├─ agents/                  schema、提示词、解析器、LLM 适配、编排
│  ├─ supabase/                浏览器端与服务端客户端
│  ├─ runtime.ts               预览运行时
│  └─ versions.ts              版本写入
└─ middleware.ts               会话刷新与路由守卫
supabase/schema.sql            表结构与 RLS
tests/                         单元测试与端到端测试
```
