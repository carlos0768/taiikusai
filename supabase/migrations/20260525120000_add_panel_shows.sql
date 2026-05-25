CREATE TABLE IF NOT EXISTS public.panel_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.project_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  panel_ids uuid[] NOT NULL,
  rows integer NOT NULL DEFAULT 1,
  cols integer NOT NULL DEFAULT 1,
  placements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT panel_shows_panel_ids_not_empty CHECK (array_length(panel_ids, 1) > 0),
  CONSTRAINT panel_shows_rows_positive CHECK (rows >= 1),
  CONSTRAINT panel_shows_cols_positive CHECK (cols >= 1)
);

CREATE INDEX IF NOT EXISTS panel_shows_project_branch_idx
  ON public.panel_shows (project_id, branch_id, created_at ASC);

ALTER TABLE public.panel_shows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panel_shows_select ON public.panel_shows;
CREATE POLICY panel_shows_select
  ON public.panel_shows
  FOR SELECT
  USING (public.has_permission('can_view_projects'));

DROP POLICY IF EXISTS panel_shows_insert ON public.panel_shows;
CREATE POLICY panel_shows_insert
  ON public.panel_shows
  FOR INSERT
  WITH CHECK (public.can_modify_branch(branch_id));

DROP POLICY IF EXISTS panel_shows_update ON public.panel_shows;
CREATE POLICY panel_shows_update
  ON public.panel_shows
  FOR UPDATE
  USING (public.can_modify_branch(branch_id))
  WITH CHECK (public.can_modify_branch(branch_id));

DROP POLICY IF EXISTS panel_shows_delete ON public.panel_shows;
CREATE POLICY panel_shows_delete
  ON public.panel_shows
  FOR DELETE
  USING (public.can_modify_branch(branch_id));
