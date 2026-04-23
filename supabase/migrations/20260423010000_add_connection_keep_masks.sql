-- Store explicit keep masks on panel-to-panel connections.
-- keep_mask_grid_data is a base64-encoded 0/1 grid:
--   0 = interval returns to white
--   1 = interval keeps the source panel color

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS keep_mask_grid_data text;
