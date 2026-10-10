# 数据库设计

完整结构见 [`supabase/schema.sql`](../supabase/schema.sql)（幂等，可以重复执行）。已有数据库按序号执行 [`supabase/migrations/`](../supabase/migrations) 下的增量脚本。

## 1. 表关系

```
auth.users ─┬─< projects ─┬─< versions
            │             ├─< messages >── versions（产出的版本，可空）
            │             └── current_version_id ──> versions
            └─< custom_agents
```

所有业务表都有 `user_id`，默认值是 `auth.uid()`。前端插入时不需要传，也没法伪造成别人。

## 2. 表

### projects 项目

| 字段 | 说明 |
| --- | --- |
| `name` / `description` | 由 Emma 的 PRD 自动更新 |
| `current_version_id` | 当前版本指针（外键，删除版本时置空） |
| `is_public` / `slug` | 发布状态与公开链接 `/p/{slug}`，slug 唯一 |
| `updated_at` | 工作台按它排序 |

### versions 版本

| 字段 | 说明 |
| --- | --- |
| `number` | 项目内递增，`unique(project_id, number)` 防止并发写出重复版本号 |
| `html` | 完整单文件快照 |
| `source` | `agent` / `manual` / `restore` / `remix`，check 约束 |
| `summary` | 本次改动说明，显示在版本面板 |

只追加不修改：恢复旧版本等于把它复制成一个新版本，历史永远完整。

### messages 对话

| 字段 | 说明 |
| --- | --- |
| `role` | `user`、`system` 或智能体 id。用正则 `^[a-z][a-z0-9_-]{1,31}$` 约束，而不是枚举，这样自定义智能体不需要改表（见迁移 002） |
| `content` | 对话中显示的文字 |
| `data` | jsonb，结构化产物：PRD、技术方案、自定义智能体的建议、出错信息等；自定义智能体的形象存在 `data._agent` |
| `version_id` | 该条消息产出的版本 |

### custom_agents 自定义智能体

| 字段 | 约束 |
| --- | --- |
| `slug` | 小写字母开头的 id，不能与内置角色（leader/pm/architect/engineer/user/system）重名；`unique(user_id, slug)` |
| `name` / `title` | 1 到 20 字 |
| `color` | `#RRGGBB` |
| `instructions` | 1 到 4000 字，职责说明 |
| `flows` | `create` / `edit` 的非空子集 |
| `after` | `leader` / `pm` / `architect`，决定出场位置 |
| `enabled` | 启停 |

数据库约束和前端表单、服务端 zod schema 三层校验，任何一层被绕过都不会写入脏数据。

## 3. 行级权限（RLS）

| 表 | 读 | 写 |
| --- | --- | --- |
| projects | 本人，或 `is_public = true` | 本人 |
| versions | 所属项目本人可读，或项目已公开 | 只能写入自己的项目 |
| messages | 本人 | 只能写入自己的项目 |
| custom_agents | 本人 | 本人 |

服务端接口也使用用户会话（不是 service role key）访问数据库，所以即使接口有漏洞，也越不过 RLS。

## 4. 索引

| 索引 | 用途 |
| --- | --- |
| `projects (user_id, updated_at desc)` | 工作台列表 |
| `versions (project_id, number desc)` | 版本面板、取最新版本 |
| `messages (project_id, created_at)` | 加载对话 |
| `messages (user_id, created_at) where role = 'user'` | 部分索引，统计 24 小时内的生成次数用于限流 |
| `custom_agents (user_id, created_at)` | 读取用户的团队，按创建顺序排列 |

## 5. 迁移

| 文件 | 内容 |
| --- | --- |
| `schema.sql` | 全量结构，新库直接执行 |
| `migrations/002_custom_agents.sql` | 放宽 `messages.role` 约束，允许自定义智能体 id |
| `migrations/003_user_custom_agents.sql` | 新增 `custom_agents` 表、索引与 RLS |

所有脚本都用 `if not exists` / `drop ... if exists` 写成幂等的，重复执行不会报错。
