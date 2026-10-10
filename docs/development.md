# 开发与部署

## 1. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase publishable key（可以公开，权限由 RLS 控制） |
| `DEEPSEEK_API_KEY` | 否 | 模型 Key，只在服务端使用。不配置时自动使用离线演示模型 |
| `LLM_BASE_URL` / `LLM_MODEL` | 否 | 切换到其他 OpenAI 兼容服务，默认 `https://api.deepseek.com` / `deepseek-chat` |
| `LLM_MOCK` | 否 | 设为 `1` 强制使用离线演示模型 |
| `DAILY_GENERATION_LIMIT` | 否 | 正式账号 24 小时生成上限，默认 40 |
| `GUEST_DAILY_GENERATION_LIMIT` | 否 | 游客 24 小时生成上限，默认 10 |
| `CUSTOM_AGENTS` | 否 | JSON 数组，对所有用户生效的全局自定义智能体 |

## 2. 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

Supabase 初始化：

1. SQL Editor 执行 `supabase/schema.sql`。
2. Authentication → Sign In / Providers：关闭 Email 的 **Confirm email**，打开 **Allow anonymous sign-ins**，并点击 **Save**。

## 3. 离线演示模型

不配置 Key 或设置 `LLM_MOCK=1` 时，`src/lib/agents/mock.ts` 按真实模型相同的格式输出（JSON、`<<<FILE>>>` 代码块、SEARCH/REPLACE 补丁），不消耗 token 就能跑通全流程。编辑器顶部会显示"离线演示模型"标记。

在需求里写 `[[模拟服务异常]]` 会模拟一次上游 503，用于演示和测试错误处理链路。

## 4. 质量检查

```bash
npm run lint
npm run typecheck
npm test            # 单元测试（Vitest）
npm run build
npm run test:e2e    # 端到端测试（Playwright），需要可用的 Supabase 和 LLM_MOCK=1
```

| 测试 | 覆盖 |
| --- | --- |
| `tests/unit/extract.test.ts` | 代码块解析、各种不规范输出的兼容、补丁精确与宽松匹配 |
| `tests/unit/agents.test.ts` | 团队组装与出场顺序、无效配置跳过、流水线事件、`halt` 提前结束、JSON 校验重试 |
| `tests/unit/errors.test.ts` | 上游错误到错误码的映射、对外错误不泄露内部信息 |
| `tests/unit/sse.test.ts` | SSE 解析、连接中断识别、错误事件 |
| `tests/e2e/flow.spec.ts` | 注册 → 生成 → 数据持久化 → 迭代 → 回滚 → 发布 → 匿名访问 → Remix，以及上游 503 的错误提示与重试 |
| `tests/e2e/agents.spec.ts` | 创建自定义智能体 → 出场 → 停用 → 跨账号隔离 |
| `tests/e2e/guest.spec.ts` | 游客直接生成 → 绑定邮箱转正，作品保留 |

CI（`.github/workflows/ci.yml`）在每次推送和 PR 时执行 lint、类型检查、单元测试和构建。

## 5. 部署（Vercel）

1. 导入仓库，框架选 Next.js（仓库内 `vercel.json` 已声明）。
2. 配置上面的必填环境变量和 `DEEPSEEK_API_KEY`。
3. Supabase → Authentication → URL Configuration，把 Site URL 设为线上域名。
4. 之后推送到 `main` 自动部署。

生成接口声明了 `maxDuration = 300`，并有 15 秒一次的 SSE 心跳。

## 6. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 游客提问提示 "Anonymous sign-ins are disabled" | Supabase 没有打开匿名登录，或打开后没点 Save |
| 注册后无法登录 | 开启了 Confirm email，需要先去邮箱确认，或在控制台关闭 |
| 页面提示缺少 Supabase 环境变量 | 检查 `NEXT_PUBLIC_SUPABASE_*`，修改后需要重新部署 |
| 生成时提示模型 Key 无效或余额不足 | 检查 `DEEPSEEK_API_KEY` 和账户余额（错误码 `LLM_AUTH` / `LLM_QUOTA`） |
| 自定义智能体保存失败 | 数据库没有执行迁移 002、003 |
| 部署后页面报 "client-side exception" | 浏览器缓存了旧版本的分包，页面会自动刷新一次；仍然出现请强制刷新 |
| 用户反馈某次生成失败 | 让对方提供错误消息里的请求 id，在 Vercel 日志中搜索 `generate.failed` 和该 id |
