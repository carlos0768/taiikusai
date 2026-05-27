create extension if not exists pgcrypto;

alter table public.projects
  add column if not exists main_branch_requires_admin_approval boolean not null default true;

alter table public.profiles
  add column if not exists login_id text,
  add column if not exists display_name text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists git_notifications_enabled boolean not null default true,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.profiles
set
  login_id = coalesce(login_id, lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g'))),
  display_name = coalesce(display_name, username)
where login_id is null
   or display_name is null;

update public.profiles
set login_id = 'admin'
where username = 'admin'
  and (login_id is null or login_id = '');

alter table public.profiles
  alter column login_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_login_id_key'
  ) then
    alter table public.profiles
      add constraint profiles_login_id_key unique (login_id);
  end if;
end $$;

create table if not exists public.user_permissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  can_view_projects boolean not null default true,
  can_create_branches boolean not null default false,
  can_edit_branch_content boolean not null default false,
  can_request_main_merge boolean not null default false,
  can_view_git_requests boolean not null default false,
  can_manage_accounts boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  is_main boolean not null default false,
  source_branch_id uuid references public.project_branches (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, name)
);

alter table public.project_branches
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

create table if not exists public.merge_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_branch_id uuid not null references public.project_branches (id) on delete cascade,
  target_branch_id uuid not null references public.project_branches (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  summary text not null default '',
  status text not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

alter table public.zentai_gamen
  add column if not exists branch_id uuid;

alter table public.connections
  add column if not exists branch_id uuid;

insert into public.project_branches (
  project_id,
  name,
  is_main,
  source_branch_id,
  grid_width,
  grid_height,
  colors,
  default_panel_duration_ms,
  default_interval_ms,
  music_data,
  created_by
)
select
  p.id,
  'main',
  true,
  null,
  p.grid_width,
  p.grid_height,
  p.colors,
  coalesce(p.default_panel_duration_ms, 2000),
  coalesce(p.default_interval_ms, 1000),
  p.music_data,
  case
    when exists (
      select 1
      from public.profiles owner_profiles
      where owner_profiles.id = p.owner_id
    ) then p.owner_id
    else null
  end
from public.projects p
on conflict (project_id, name) do update
set
  is_main = excluded.is_main,
  created_by = coalesce(public.project_branches.created_by, excluded.created_by);

update public.zentai_gamen zg
set branch_id = pb.id
from public.project_branches pb
where pb.project_id = zg.project_id
  and pb.is_main = true
  and zg.branch_id is null;

update public.connections c
set branch_id = pb.id
from public.project_branches pb
where pb.project_id = c.project_id
  and pb.is_main = true
  and c.branch_id is null;

alter table public.zentai_gamen
  alter column branch_id set not null;

alter table public.connections
  alter column branch_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'zentai_gamen_branch_id_fkey'
  ) then
    alter table public.zentai_gamen
      add constraint zentai_gamen_branch_id_fkey
      foreign key (branch_id) references public.project_branches (id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'connections_branch_id_fkey'
  ) then
    alter table public.connections
      add constraint connections_branch_id_fkey
      foreign key (branch_id) references public.project_branches (id) on delete cascade;
  end if;
end $$;

create index if not exists idx_profiles_login_id on public.profiles (login_id);
create index if not exists idx_project_branches_project_id on public.project_branches (project_id);
create index if not exists idx_zentai_gamen_branch_id on public.zentai_gamen (branch_id);
create index if not exists idx_connections_branch_id on public.connections (branch_id);
create index if not exists idx_merge_requests_project_status on public.merge_requests (project_id, status, created_at desc);
create index if not exists idx_notifications_recipient_read on public.notifications (recipient_id, is_read, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_permissions_set_updated_at on public.user_permissions;
create trigger user_permissions_set_updated_at
before update on public.user_permissions
for each row
execute function public.set_updated_at();

drop trigger if exists project_branches_set_updated_at on public.project_branches;
create trigger project_branches_set_updated_at
before update on public.project_branches
for each row
execute function public.set_updated_at();

drop trigger if exists merge_requests_set_updated_at on public.merge_requests;
create trigger merge_requests_set_updated_at
before update on public.merge_requests
for each row
execute function public.set_updated_at();

create or replace function public.ensure_default_permissions()
returns trigger
language plpgsql
as $$
begin
  insert into public.user_permissions (
    user_id,
    can_view_projects,
    can_create_branches,
    can_edit_branch_content,
    can_request_main_merge,
    can_view_git_requests,
    can_manage_accounts
  )
  values (
    new.id,
    true,
    new.is_admin,
    new.is_admin,
    new.is_admin,
    new.is_admin,
    new.is_admin
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_default_permissions on public.profiles;
create trigger profiles_default_permissions
after insert on public.profiles
for each row
execute function public.ensure_default_permissions();

insert into public.user_permissions (
  user_id,
  can_view_projects,
  can_create_branches,
  can_edit_branch_content,
  can_request_main_merge,
  can_view_git_requests,
  can_manage_accounts
)
select
  p.id,
  true,
  p.is_admin,
  p.is_admin,
  p.is_admin,
  p.is_admin,
  p.is_admin
from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.is_active_profile()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.is_admin = true
  );
$$;

create or replace function public.has_permission(permission_name text)
returns boolean
language plpgsql
stable
as $$
declare
  allowed boolean;
begin
  if public.is_admin_user() then
    return true;
  end if;

  execute format(
    'select coalesce(%I, false) from public.user_permissions where user_id = auth.uid()',
    permission_name
  ) into allowed;

  return coalesce(allowed, false) and public.is_active_profile();
end;
$$;

create or replace function public.can_modify_branch(target_branch_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.project_branches pb
    join public.projects p on p.id = pb.project_id
    left join public.user_permissions up on up.user_id = auth.uid()
    left join public.profiles pr on pr.id = auth.uid()
    where pb.id = target_branch_id
      and pr.status = 'active'
      and (
        pr.is_admin
        or (
          coalesce(up.can_edit_branch_content, false)
          and (
            pb.is_main = false
            or p.main_branch_requires_admin_approval = false
          )
        )
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.projects enable row level security;
alter table public.templates enable row level security;
alter table public.project_branches enable row level security;
alter table public.zentai_gamen enable row level security;
alter table public.connections enable row level security;
alter table public.merge_requests enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
using (public.is_admin_user() or id = auth.uid());

drop policy if exists user_permissions_select on public.user_permissions;
create policy user_permissions_select on public.user_permissions
for select
using (public.is_admin_user() or user_id = auth.uid());

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
for select
using (public.has_permission('can_view_projects'));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
for insert
with check (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
for update
using (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
)
with check (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
for delete
using (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
for select
using (public.has_permission('can_view_projects'));

drop policy if exists templates_insert on public.templates;
create policy templates_insert on public.templates
for insert
with check (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates
for update
using (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
)
with check (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates
for delete
using (
  public.is_admin_user()
  or public.has_permission('can_edit_branch_content')
);

drop policy if exists project_branches_select on public.project_branches;
create policy project_branches_select on public.project_branches
for select
using (public.has_permission('can_view_projects'));

drop policy if exists zentai_gamen_select on public.zentai_gamen;
create policy zentai_gamen_select on public.zentai_gamen
for select
using (public.has_permission('can_view_projects'));

drop policy if exists zentai_gamen_insert on public.zentai_gamen;
create policy zentai_gamen_insert on public.zentai_gamen
for insert
with check (public.can_modify_branch(branch_id));

drop policy if exists zentai_gamen_update on public.zentai_gamen;
create policy zentai_gamen_update on public.zentai_gamen
for update
using (public.can_modify_branch(branch_id))
with check (public.can_modify_branch(branch_id));

drop policy if exists zentai_gamen_delete on public.zentai_gamen;
create policy zentai_gamen_delete on public.zentai_gamen
for delete
using (public.can_modify_branch(branch_id));

drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
for select
using (public.has_permission('can_view_projects'));

drop policy if exists connections_insert on public.connections;
create policy connections_insert on public.connections
for insert
with check (public.can_modify_branch(branch_id));

drop policy if exists connections_update on public.connections;
create policy connections_update on public.connections
for update
using (public.can_modify_branch(branch_id))
with check (public.can_modify_branch(branch_id));

drop policy if exists connections_delete on public.connections;
create policy connections_delete on public.connections
for delete
using (public.can_modify_branch(branch_id));

drop policy if exists merge_requests_select on public.merge_requests;
create policy merge_requests_select on public.merge_requests
for select
using (
  public.is_admin_user()
  or public.has_permission('can_view_git_requests')
  or requested_by = auth.uid()
);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select
using (recipient_id = auth.uid() or public.is_admin_user());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
for update
using (recipient_id = auth.uid() or public.is_admin_user())
with check (recipient_id = auth.uid() or public.is_admin_user());
