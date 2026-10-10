-- 002：允许自定义智能体写入对话
-- messages.role 原先只允许内置角色，放宽为任意合法的智能体 id（小写字母开头，可含数字、- 和 _）
alter table public.messages drop constraint if exists messages_role_check;
alter table public.messages add constraint messages_role_check check (role ~ '^[a-z][a-z0-9_-]{1,31}$');
