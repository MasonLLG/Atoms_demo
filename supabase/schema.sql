-- Atoms Demo 数据库结构：在 Supabase 控制台 SQL Editor 中整段执行即可（可重复执行）
-- 已经执行过旧版本的数据库，请按顺序执行 supabase/migrations/ 下的增量脚本

create extension if not exists pgcrypto;

-- 项目
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '未命名应用',
  description text,
  current_version_id uuid,
  is_public boolean not null default false,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 版本：每次生成 / 手动编辑 / 恢复都会产生一个完整代码快照
create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number int not null,
  html text not null,
  summary text,
  source text not null default 'agent' check (source in ('agent', 'manual', 'restore', 'remix')),
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

do $$ begin
  alter table public.projects
    add constraint fk_current_version foreign key (current_version_id)
    references public.versions (id) on delete set null;
exception when duplicate_object then null; end $$;

-- 对话：用户消息与各智能体的输出（结构化产物存在 data 字段）
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- user / system / 智能体 id（内置为 leader、pm、architect、engineer，也可以是自定义 id）
  role text not null constraint messages_role_check check (role ~ '^[a-z][a-z0-9_-]{1,31}$'),
  content text not null default '',
  data jsonb,
  version_id uuid references public.versions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);
create index if not exists versions_project_idx on public.versions (project_id, number desc);
create index if not exists messages_project_idx on public.messages (project_id, created_at);
create index if not exists messages_user_day_idx on public.messages (user_id, created_at) where role = 'user';

-- 行级权限：只能读写自己的数据；公开项目任何人可读
alter table public.projects enable row level security;
alter table public.versions enable row level security;
alter table public.messages enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (user_id = auth.uid() or is_public);
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert with check (user_id = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (user_id = auth.uid());

drop policy if exists versions_select on public.versions;
create policy versions_select on public.versions for select using (
  exists (select 1 from public.projects p where p.id = project_id and (p.user_id = auth.uid() or p.is_public))
);
drop policy if exists versions_insert on public.versions;
create policy versions_insert on public.versions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (user_id = auth.uid());
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
