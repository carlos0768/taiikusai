create table if not exists public.text_to_panel_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  branch_id uuid not null references public.project_branches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  last_dsl jsonb,
  last_model text,
  last_usage jsonb,
  last_warnings text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, branch_id, user_id),
  constraint text_to_panel_sessions_messages_array_check
    check (jsonb_typeof(messages) = 'array')
);

create index if not exists text_to_panel_sessions_branch_user_idx
  on public.text_to_panel_sessions (branch_id, user_id, updated_at desc);

drop trigger if exists text_to_panel_sessions_set_updated_at
  on public.text_to_panel_sessions;
create trigger text_to_panel_sessions_set_updated_at
before update on public.text_to_panel_sessions
for each row
execute function public.set_updated_at();

alter table public.text_to_panel_sessions enable row level security;

drop policy if exists text_to_panel_sessions_select
  on public.text_to_panel_sessions;
create policy text_to_panel_sessions_select
on public.text_to_panel_sessions
for select
using (
  user_id = auth.uid()
  and public.has_permission('can_view_projects')
);

drop policy if exists text_to_panel_sessions_insert
  on public.text_to_panel_sessions;
create policy text_to_panel_sessions_insert
on public.text_to_panel_sessions
for insert
with check (
  user_id = auth.uid()
  and public.can_modify_branch(branch_id)
);

drop policy if exists text_to_panel_sessions_update
  on public.text_to_panel_sessions;
create policy text_to_panel_sessions_update
on public.text_to_panel_sessions
for update
using (
  user_id = auth.uid()
  and public.can_modify_branch(branch_id)
)
with check (
  user_id = auth.uid()
  and public.can_modify_branch(branch_id)
);

drop policy if exists text_to_panel_sessions_delete
  on public.text_to_panel_sessions;
create policy text_to_panel_sessions_delete
on public.text_to_panel_sessions
for delete
using (user_id = auth.uid());
