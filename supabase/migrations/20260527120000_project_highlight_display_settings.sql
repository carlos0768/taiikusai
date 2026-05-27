alter table public.projects
  add column if not exists highlight_branch_id uuid references public.project_branches (id) on delete set null,
  add column if not exists highlight_start_zentai_gamen_id uuid references public.zentai_gamen (id) on delete set null;

create index if not exists idx_projects_highlight_branch_id
  on public.projects (highlight_branch_id);

create index if not exists idx_projects_highlight_start_zentai_gamen_id
  on public.projects (highlight_start_zentai_gamen_id);
