create or replace function public.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
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
security definer
set search_path = public
as $$
declare
  allowed boolean;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    return false;
  end if;

  if public.is_admin_user() then
    return true;
  end if;

  execute format(
    'select coalesce(%I, false) from public.user_permissions where user_id = $1',
    permission_name
  )
  into allowed
  using current_user_id;

  return coalesce(allowed, false) and public.is_active_profile();
end;
$$;

create or replace function public.can_modify_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
