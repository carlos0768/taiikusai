-- Ensure remote databases that already applied 20260423010000 before the
-- connection-based keep migration still receive the keep mask column.

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS keep_mask_grid_data text;
