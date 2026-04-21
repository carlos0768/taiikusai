-- Save the pre-resize editing state whenever a project's grid size changes.

CREATE TABLE IF NOT EXISTS project_grid_resize_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_grid_width integer NOT NULL,
  from_grid_height integer NOT NULL,
  to_grid_width integer NOT NULL,
  to_grid_height integer NOT NULL,
  auto_adjust_illustration boolean NOT NULL DEFAULT true,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_grid_resize_history_project_id_created_at_idx
  ON project_grid_resize_history (project_id, created_at DESC);

ALTER TABLE project_grid_resize_history
  DROP CONSTRAINT IF EXISTS project_grid_resize_history_from_grid_width_check,
  DROP CONSTRAINT IF EXISTS project_grid_resize_history_from_grid_height_check,
  DROP CONSTRAINT IF EXISTS project_grid_resize_history_to_grid_width_check,
  DROP CONSTRAINT IF EXISTS project_grid_resize_history_to_grid_height_check;

ALTER TABLE project_grid_resize_history
  ADD CONSTRAINT project_grid_resize_history_from_grid_width_check
  CHECK (from_grid_width BETWEEN 5 AND 200),
  ADD CONSTRAINT project_grid_resize_history_from_grid_height_check
  CHECK (from_grid_height BETWEEN 5 AND 200),
  ADD CONSTRAINT project_grid_resize_history_to_grid_width_check
  CHECK (to_grid_width BETWEEN 5 AND 200),
  ADD CONSTRAINT project_grid_resize_history_to_grid_height_check
  CHECK (to_grid_height BETWEEN 5 AND 200);
