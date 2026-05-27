-- Allow the app's anon-role server/browser clients to persist resize history.

ALTER TABLE project_grid_resize_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project-grid-resize-history public read"
  ON project_grid_resize_history;
CREATE POLICY "project-grid-resize-history public read"
  ON project_grid_resize_history
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "project-grid-resize-history public insert"
  ON project_grid_resize_history;
CREATE POLICY "project-grid-resize-history public insert"
  ON project_grid_resize_history
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "project-grid-resize-history public delete"
  ON project_grid_resize_history;
CREATE POLICY "project-grid-resize-history public delete"
  ON project_grid_resize_history
  FOR DELETE
  USING (true);
