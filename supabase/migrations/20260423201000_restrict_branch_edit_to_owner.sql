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
    left join public.user_permissions up on up.user_id = auth.uid()
    left join public.profiles pr on pr.id = auth.uid()
    where pb.id = target_branch_id
      and pr.status = 'active'
      and (
        pr.is_admin
        or (
          pb.is_main = false
          and pb.created_by = auth.uid()
          and (
            coalesce(up.can_edit_branch_content, false)
            or coalesce(up.can_create_branches, false)
          )
        )
      )
  );
$$;

drop policy if exists "project-branches public insert" on public.project_branches;
drop policy if exists "project-branches public update" on public.project_branches;
drop policy if exists "project-branches public delete" on public.project_branches;

drop policy if exists project_branches_insert on public.project_branches;
create policy project_branches_insert on public.project_branches
for insert
with check (
  public.is_admin_user()
  or (
    public.has_permission('can_create_branches')
    and is_main = false
    and created_by = auth.uid()
  )
);

drop policy if exists project_branches_update on public.project_branches;
create policy project_branches_update on public.project_branches
for update
using (
  public.is_admin_user()
  or (
    is_main = false
    and created_by = auth.uid()
    and (
      public.has_permission('can_edit_branch_content')
      or public.has_permission('can_create_branches')
    )
  )
)
with check (
  public.is_admin_user()
  or (
    is_main = false
    and created_by = auth.uid()
    and (
      public.has_permission('can_edit_branch_content')
      or public.has_permission('can_create_branches')
    )
  )
);

drop policy if exists project_branches_delete on public.project_branches;
create policy project_branches_delete on public.project_branches
for delete
using (
  public.is_admin_user()
  or (
    is_main = false
    and created_by = auth.uid()
    and public.has_permission('can_create_branches')
  )
);
