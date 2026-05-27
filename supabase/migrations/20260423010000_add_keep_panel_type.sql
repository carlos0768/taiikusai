-- Add explicit keep panel support to zentai_gamen.
-- keep panels use grid_data as a 0/1 mask:
--   0 = keep しない
--   1 = 直前表示を保持する

ALTER TABLE zentai_gamen
  DROP CONSTRAINT IF EXISTS zentai_gamen_panel_type_check;

ALTER TABLE zentai_gamen
  ADD CONSTRAINT zentai_gamen_panel_type_check
  CHECK (panel_type IN ('general', 'motion', 'keep'));
