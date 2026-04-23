create or replace function public.can_modify_branch(target_branch_id uuid)
returns boolean
language sql
stable
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
          and (
            coalesce(up.can_edit_branch_content, false)
            or (
              coalesce(up.can_create_branches, false)
              and pb.created_by = auth.uid()
            )
          )
        )
      )
  );
$$;
