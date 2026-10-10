-- 003：自定义智能体与账号绑定，每个用户只能看到和使用自己创建的智能体

create table if not exists public.custom_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 智能体 id，同时作为对话中的 role，不能与内置角色重名
  slug text not null check (
    slug ~ '^[a-z][a-z0-9_-]{1,31}$'
    and slug not in ('user', 'system', 'leader', 'pm', 'architect', 'engineer')
  ),
  name text not null check (char_length(name) between 1 and 20),
  title text not null check (char_length(title) between 1 and 20),
  color text not null default '#8b5cf6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar text check (char_length(avatar) <= 2),
  description text check (char_length(description) <= 200),
  instructions text not null check (char_length(instructions) between 1 and 4000),
  flows text[] not null default '{create}' check (flows <@ array['create', 'edit'] and cardinality(flows) > 0),
  after text not null default 'architect' check (after in ('leader', 'pm', 'architect')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists custom_agents_user_idx on public.custom_agents (user_id, created_at);

alter table public.custom_agents enable row level security;

drop policy if exists custom_agents_select on public.custom_agents;
create policy custom_agents_select on public.custom_agents for select using (user_id = auth.uid());
drop policy if exists custom_agents_insert on public.custom_agents;
create policy custom_agents_insert on public.custom_agents for insert with check (user_id = auth.uid());
drop policy if exists custom_agents_update on public.custom_agents;
create policy custom_agents_update on public.custom_agents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists custom_agents_delete on public.custom_agents;
create policy custom_agents_delete on public.custom_agents for delete using (user_id = auth.uid());
