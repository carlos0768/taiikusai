-- Add GitHub-style project branches and branch-local state.

CREATE TABLE IF NOT EXISTS project_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  source_branch_id uuid REFERENCES project_branches(id) ON DELETE SET NULL,
  grid_width integer NOT NULL,
  grid_height integer NOT NULL,
  colors jsonb NOT NULL,
  default_panel_duration_ms integer NOT NULL,
  default_interval_ms integer NOT NULL,
  music_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_branches_project_id_name_key
  ON project_branches (project_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS project_branches_project_main_key
  ON project_branches (project_id)
  WHERE is_main = true;

CREATE INDEX IF NOT EXISTS project_branches_project_id_created_at_idx
  ON project_branches (project_id, created_at ASC);

ALTER TABLE project_branches
  DROP CONSTRAINT IF EXISTS project_branches_grid_width_check,
  DROP CONSTRAINT IF EXISTS project_branches_grid_height_check,
  DROP CONSTRAINT IF EXISTS project_branches_default_panel_duration_ms_check,
  DROP CONSTRAINT IF EXISTS project_branches_default_interval_ms_check;

ALTER TABLE project_branches
  ADD CONSTRAINT project_branches_grid_width_check
  CHECK (grid_width BETWEEN 5 AND 200),
  ADD CONSTRAINT project_branches_grid_height_check
  CHECK (grid_height BETWEEN 5 AND 200),
  ADD CONSTRAINT project_branches_default_panel_duration_ms_check
  CHECK (default_panel_duration_ms BETWEEN 200 AND 10000),
  ADD CONSTRAINT project_branches_default_interval_ms_check
  CHECK (default_interval_ms BETWEEN 200 AND 10000);

CREATE OR REPLACE FUNCTION create_main_project_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO project_branches (
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
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'main',
    true,
    NULL,
    NEW.grid_width,
    NEW.grid_height,
    NEW.colors,
    NEW.default_panel_duration_ms,
    NEW.default_interval_ms,
    NEW.music_data,
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (project_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_create_main_branch ON projects;
CREATE TRIGGER projects_create_main_branch
AFTER INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION create_main_project_branch();

INSERT INTO project_branches (
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
  created_at,
  updated_at
)
SELECT
  projects.id,
  'main',
  true,
  NULL,
  projects.grid_width,
  projects.grid_height,
  projects.colors,
  projects.default_panel_duration_ms,
  projects.default_interval_ms,
  projects.music_data,
  projects.created_at,
  projects.updated_at
FROM projects
WHERE NOT EXISTS (
  SELECT 1
  FROM project_branches
  WHERE project_branches.project_id = projects.id
    AND project_branches.is_main = true
);

ALTER TABLE zentai_gamen
  ADD COLUMN IF NOT EXISTS branch_id uuid;

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS branch_id uuid;

ALTER TABLE project_grid_resize_history
  ADD COLUMN IF NOT EXISTS branch_id uuid;

UPDATE zentai_gamen
SET branch_id = project_branches.id
FROM project_branches
WHERE project_branches.project_id = zentai_gamen.project_id
  AND project_branches.is_main = true
  AND zentai_gamen.branch_id IS NULL;

UPDATE connections
SET branch_id = project_branches.id
FROM project_branches
WHERE project_branches.project_id = connections.project_id
  AND project_branches.is_main = true
  AND connections.branch_id IS NULL;

UPDATE project_grid_resize_history
SET branch_id = project_branches.id
FROM project_branches
WHERE project_branches.project_id = project_grid_resize_history.project_id
  AND project_branches.is_main = true
  AND project_grid_resize_history.branch_id IS NULL;

ALTER TABLE zentai_gamen
  ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE connections
  ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE project_grid_resize_history
  ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE zentai_gamen
  DROP CONSTRAINT IF EXISTS zentai_gamen_branch_id_fkey;
ALTER TABLE zentai_gamen
  ADD CONSTRAINT zentai_gamen_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES project_branches(id) ON DELETE CASCADE;

ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_branch_id_fkey;
ALTER TABLE connections
  ADD CONSTRAINT connections_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES project_branches(id) ON DELETE CASCADE;

ALTER TABLE project_grid_resize_history
  DROP CONSTRAINT IF EXISTS project_grid_resize_history_branch_id_fkey;
ALTER TABLE project_grid_resize_history
  ADD CONSTRAINT project_grid_resize_history_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES project_branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS zentai_gamen_project_id_branch_id_created_at_idx
  ON zentai_gamen (project_id, branch_id, created_at ASC);

CREATE INDEX IF NOT EXISTS connections_project_id_branch_id_sort_order_idx
  ON connections (project_id, branch_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS project_grid_resize_history_project_id_branch_id_created_at_idx
  ON project_grid_resize_history (project_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_branch_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_branch_id uuid NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
  target_branch_id uuid NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_branch_merges_project_id_created_at_idx
  ON project_branch_merges (project_id, created_at DESC);
