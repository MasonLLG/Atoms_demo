# 架构设计

## 1. 总览

```
浏览器
 ├─ 首页 / 登录注册 / 游客模式（Supabase Auth，匿名登录）
 ├─ 工作台、我的智能体、项目管理、版本恢复、发布、Remix
 │    └─ 直接通过 Supabase SDK 读写，受行级权限（RLS）保护
 └─ 编辑器
      ├─ 对话区：多智能体消息流 + PRD / 技术方案 / 建议卡片
      ├─ 代码区：Monaco
      └─ 预览区：sandbox iframe + 预览运行时

Next.js 服务端（Vercel Serverless）
 └─ POST /api/generate
      鉴权 → 参数校验 → 限流 → 组装团队 → 流水线执行 → SSE 推送
      （模型 API Key 只存在服务端）

Supabase
 ├─ Auth：邮箱密码、匿名用户
 └─ Postgres：projects / versions / messages / custom_agents，全部开启 RLS
```

**为什么只有一个服务端接口**：只有调用模型需要保密的 API Key，其余操作（项目增删改、版本恢复、发布、Remix、智能体管理）都由前端直接调用 Supabase，由 RLS 保证只能操作自己的数据。这样后端代码量最小，权限规则集中在数据库一处。

## 2. 一次生成的完整流程

```
浏览器                    /api/generate                 智能体流水线                    DeepSeek
  │ POST {projectId,prompt}    │                              │                              │
  │──────────────────────────>│ 校验登录、参数、项目归属、额度  │                              │
  │                            │ 保存用户消息，读取当前版本      │                              │
  │<──── SSE: meta ────────────│ 组装团队（内置 + 用户启用的自定义智能体）                      │
  │                            │─────────────────────────────>│ Mike：判断意图（JSON）        │
  │<──── agent_start/done ─────│                              │─────────────────────────────>│
  │                            │                              │ 闲聊 → halt，流程结束         │
  │                            │                              │ Emma：PRD（JSON）             │
  │                            │                              │ Bob：技术方案（JSON）          │
  │                            │                              │ 自定义智能体：建议（JSON）     │
  │<──── delta（代码流）────────│                              │ Alex：流式写代码 / 补丁        │
  │                            │                              │ 保存版本                      │
  │<──── version_saved ────────│                              │                              │
  │<──── done ─────────────────│                              │                              │
```

- 每个成员的产出都会保存为一条消息（结构化产物在 `messages.data`），刷新页面可以完整还原对话。
- 流式输出期间每 15 秒发送一次 SSE 心跳，避免代理在模型思考时断开空闲连接。
- 前端没有收到 `done` 就判定为连接中断，提示用户重试。

## 3. 智能体框架

代码在 `src/lib/agents/`：

```
core/
  types.ts      Agent 接口、AgentContext（共享上下文）、AgentIO（运行时能力）
  factories.ts  defineJsonAgent / defineStaticAgent / defineCustomAgent
  runner.ts     runPipeline：事件推送、消息持久化、JSON 校验重试、提前结束
team/
  leader.ts     Mike：意图判断与分派
  pm.ts         Emma：PRD
  architect.ts  Bob：技术方案
  engineer.ts   Alex：写代码、补丁、回退、保存版本
  index.ts      buildTeam：组装团队；loadUserAgents：读取用户的自定义智能体
custom.ts       自定义智能体的数据结构、模板、出场顺序计算（前后端共用）
orchestrator.ts runGeneration：准备上下文 → 组装团队 → 执行流水线
```

### 3.1 最小接口

```ts
interface Agent {
  id: string;
  profile: AgentProfile;             // 名字、头衔、颜色、头像
  startStatus: string;
  when?(ctx: AgentContext): boolean; // 是否出场
  run(ctx: AgentContext, io: AgentIO): Promise<AgentResult>;
}

interface AgentResult {
  content: string;     // 对话中展示的文字
  data?: unknown;      // 结构化产物，前端渲染成卡片
  versionId?: string;  // 产出的新版本
  halt?: boolean;      // 结束流水线
}
```

智能体只关心自己的工作：从 `ctx` 读取前面成员的产物，通过 `io` 调用模型，把产物写回 `ctx`。事件推送、消息持久化、错误包装都由 `runPipeline` 统一处理。

### 3.2 共享上下文（黑板模式）

| 字段 | 内容 |
| --- | --- |
| `prompt` / `flow` | 用户消息；`create`（还没有代码）或 `edit`（迭代修改） |
| `currentHtml` / `history` | 当前版本代码；最近几轮对话 |
| `team` | 本次出场的成员，Mike 用它播报阵容 |
| `artifacts` | 按智能体 id 存放的结构化产物，例如 `artifacts.pm` 是 PRD |
| `notes` | 自定义智能体留给工程师的建议，会自动拼进工程师的输入 |
| `output` / `halted` | 产出的新版本；是否被提前结束 |

### 3.3 团队组装

`buildTeam(custom)` 按 Mike → Emma → Bob → Alex 排列内置成员，自定义智能体按配置里的 `after` 插入到对应成员之后（同一位置按创建顺序排列），工程师永远最后。出场顺序由纯函数 `orderLineup` 计算，「我的智能体」页面的顺序预览和服务端用的是同一个函数。

每个成员在执行前由 `when(ctx)` 决定是否出场：Emma 和 Bob 只在首次生成时出场，自定义智能体按配置参与首次生成和（或）迭代修改。

### 3.4 自定义智能体

- 配置是纯数据：id、名字、头衔、颜色、职责说明、参与的流程、出场位置，用 zod schema `CustomAgentConfigSchema` 校验（前端表单和服务端用同一个 schema）。
- `defineCustomAgent` 把配置变成一个 JSON 智能体：输入是需求、PRD、技术方案和当前代码节选，输出是 `{ summary, recommendations[] }`，建议写入 `notes`。
- 来源有两个：用户在「我的智能体」中创建的（`custom_agents` 表，按账号隔离），以及环境变量 `CUSTOM_AGENTS` 中配置的全局智能体。单个配置无效时跳过，不影响整个团队。
- 自定义智能体的形象随消息保存在 `data._agent` 中，刷新后依然能正确显示。

## 4. 结构化输出

| 环节 | 形式 | 原因 |
| --- | --- | --- |
| Mike、Emma、Bob、自定义智能体 | JSON，zod 校验，失败把错误信息回传给模型重试一次 | 需要被程序消费：路由、渲染卡片、传给下游 |
| Alex 首次生成 | `SUMMARY:` 行 + `<<<FILE index.html>>> … <<<END>>>` 包裹的纯文本 | 代码放进 JSON 字符串要转义引号和换行，容易出错，也没法边生成边预览 |
| Alex 迭代修改 | SEARCH/REPLACE 补丁块 | 输出量小、速度快；先精确匹配，再忽略缩进宽松匹配，都失败就回退为整文件重写 |

zod schema 是唯一事实来源：`z.toJSONSchema` 生成给模型看的 Schema，服务端用同一个 schema 校验。

## 5. 预览沙箱

- 生成的代码运行在 `sandbox="allow-scripts allow-forms allow-modals allow-popups"` 的 iframe 中，**不加** `allow-same-origin`，拿不到主站的 Cookie 和登录态。
- 代价是 iframe 里原生的 localStorage 不可用。预览运行时（`src/lib/runtime.ts`）在 `<head>` 最前面注入一段脚本：
  1. 用 Storage 替身接管 `localStorage` 和 `sessionStorage`，写入时通过 `postMessage` 交给父页面，按项目保存；下次打开时作为种子数据注入。生成的应用不需要任何改动就能持久化数据。
  2. 捕获 `error` 和 `unhandledrejection` 并回传，编辑器据此显示"让 Alex 修复"。
- 父页面只接受来自当前 iframe 的消息（校验 `event.source`），并在流式生成期间忽略存储写入和错误。

## 6. SSE 事件协议

定义在 `src/lib/agents/events.ts`：

| 事件 | 含义 |
| --- | --- |
| `meta` | 模型模式（真实或离线）与流程（`create` / `edit`） |
| `agent_start` | 某个成员开始工作，附带其形象 |
| `status` | 成员的状态变化，如"补丁未能精确应用，改为整文件重写" |
| `delta` | 流式输出的增量（服务端按 80ms 合并，减少事件数量） |
| `agent_done` | 成员完成，附带展示文字和结构化产物 |
| `project` | 项目名称和描述更新（来自 PRD） |
| `version_saved` | 新版本已保存 |
| `error` | `code`、`message`、`retryable`、`requestId` |
| `done` | 结束；没有收到它就是连接中断 |

## 7. 错误处理与可观测性

**统一错误码**（`src/lib/errors.ts`）：服务端把任意异常归类为 `AppError`，接口和 SSE 只返回 `code / message / retryable`，原始错误只进日志。

| 错误码 | 场景 | 可重试 |
| --- | --- | --- |
| `UNAUTHORIZED` / `BAD_REQUEST` / `NOT_FOUND` | 未登录、参数错误、项目不存在或不属于当前用户 | 否 |
| `RATE_LIMITED` | 超出每日额度（游客和正式账号分别计算） | 否 |
| `LLM_AUTH` / `LLM_QUOTA` | 模型 API Key 无效、余额不足（上游 401/403、402） | 否 |
| `LLM_BUSY` / `LLM_UNAVAILABLE` | 上游 429、5xx、连接失败 | 是 |
| `LLM_TIMEOUT` | 请求超时，或流式输出 45 秒没有新内容（空闲看门狗） | 是 |
| `LLM_BAD_OUTPUT` | JSON 重试后仍不合法、没有输出有效 HTML | 是 |
| `DB_ERROR` | 保存消息或版本失败 | 是 |
| `CANCELLED` | 用户点了停止 | 是 |

**重试策略**：模型调用使用 SDK 内置的指数退避重试（连接错误、408、409、429、5xx，最多 2 次；流式请求只重试建立连接阶段）。JSON 输出不合法时把校验错误回传给模型重试一次。补丁打不上时回退为整文件重写。用户侧的错误消息带"重试"按钮，可重试的错误一键重发原需求。

**日志**：每次生成输出结构化 JSON 日志（`generate.start` / `generate.done` / `generate.failed`），包含请求 id、用户、项目、是否游客、模型模式、耗时、错误码和上游状态码。请求 id 同时出现在响应头 `X-Request-Id` 和前端错误消息里，用户反馈问题时可以直接对照日志。

**前端兜底**：页面级 Error Boundary 显示具体报错；部署切换导致的 JS 分包加载失败会自动刷新一次。环境变量缺失时给出明确提示，而不是在 SDK 深处报错。

## 8. 安全

- 模型 API Key 只在服务端环境变量中，不带 `NEXT_PUBLIC_` 前缀，不会进入浏览器。
- 所有表开启 RLS：项目、版本、消息、自定义智能体都只能被本人读写；已发布的项目和它的版本任何人可读。
- 生成代码在无 `allow-same-origin` 的沙箱中运行，与主站隔离。
- 按账号限流，游客额度更低，防止 Key 被滥用。
- 自定义智能体的 id 在数据库层用 check 约束禁止与内置角色重名，前后端用同一个 zod schema 校验配置。
