-- Add project-level default playback timings and per-item overrides

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS default_panel_duration_ms integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS default_interval_ms integer NOT NULL DEFAULT 1000;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_default_panel_duration_ms_check,
  DROP CONSTRAINT IF EXISTS projects_default_interval_ms_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_default_panel_duration_ms_check
  CHECK (default_panel_duration_ms BETWEEN 200 AND 10000),
  ADD CONSTRAINT projects_default_interval_ms_check
  CHECK (default_interval_ms BETWEEN 200 AND 10000);

ALTER TABLE zentai_gamen
  ADD COLUMN IF NOT EXISTS panel_duration_override_ms integer;

ALTER TABLE zentai_gamen
  DROP CONSTRAINT IF EXISTS zentai_gamen_panel_duration_override_ms_check;

ALTER TABLE zentai_gamen
  ADD CONSTRAINT zentai_gamen_panel_duration_override_ms_check
  CHECK (
    panel_duration_override_ms IS NULL
    OR panel_duration_override_ms BETWEEN 200 AND 10000
  );

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS interval_override_ms integer;

ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_interval_override_ms_check;

ALTER TABLE connections
  ADD CONSTRAINT connections_interval_override_ms_check
  CHECK (
    interval_override_ms IS NULL
    OR interval_override_ms BETWEEN 200 AND 10000
  );
