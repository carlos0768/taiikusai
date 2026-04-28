CREATE TABLE IF NOT EXISTS public.collapsed_panel_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.project_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  node_ids uuid[] NOT NULL,
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collapsed_panel_groups_node_ids_not_empty CHECK (array_length(node_ids, 1) > 0)
);

CREATE INDEX IF NOT EXISTS collapsed_panel_groups_project_branch_idx
  ON public.collapsed_panel_groups (project_id, branch_id, created_at ASC);

ALTER TABLE public.collapsed_panel_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collapsed_panel_groups_select
  ON public.collapsed_panel_groups;
CREATE POLICY collapsed_panel_groups_select
  ON public.collapsed_panel_groups
  FOR SELECT
  USING (public.has_permission('can_view_projects'));

DROP POLICY IF EXISTS collapsed_panel_groups_insert
  ON public.collapsed_panel_groups;
CREATE POLICY collapsed_panel_groups_insert
  ON public.collapsed_panel_groups
  FOR INSERT
  WITH CHECK (public.can_modify_branch(branch_id));

DROP POLICY IF EXISTS collapsed_panel_groups_update
  ON public.collapsed_panel_groups;
CREATE POLICY collapsed_panel_groups_update
  ON public.collapsed_panel_groups
  FOR UPDATE
  USING (public.can_modify_branch(branch_id))
  WITH CHECK (public.can_modify_branch(branch_id));

DROP POLICY IF EXISTS collapsed_panel_groups_delete
  ON public.collapsed_panel_groups;
CREATE POLICY collapsed_panel_groups_delete
  ON public.collapsed_panel_groups
  FOR DELETE
  USING (public.can_modify_branch(branch_id));
