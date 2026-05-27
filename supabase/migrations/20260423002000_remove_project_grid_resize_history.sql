-- Remove obsolete resize history tables now that branch-based workflows replace them.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'project_grid_resize_history'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "project-grid-resize-history public read" ON project_grid_resize_history';
    EXECUTE 'DROP POLICY IF EXISTS "project-grid-resize-history public insert" ON project_grid_resize_history';
    EXECUTE 'DROP POLICY IF EXISTS "project-grid-resize-history public delete" ON project_grid_resize_history';
  END IF;
END;
$$;

DROP TABLE IF EXISTS project_grid_resize_history;
