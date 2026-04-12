-- Add motion panel support to zentai_gamen
-- See CLAUDE.md "ウェーブパネル" feature
--
-- panel_type:
--   'general' (default) — 従来の一般パネル。フレーム到来時に全セルが一斉に色を出す
--   'motion'            — モーションパネル。motion_type で具体的な動きを指定
--
-- motion_type:
--   'wave'  — 左列から右列へ列単位で色が伝播するウェーブ
--
-- motion_data (jsonb): motion_type 別のパラメータ
--   wave の場合: {
--     "after_grid_data": "<base64>",      -- 適用後パネルの grid_data
--     "before_duration_ms": 1000,          -- 素地を表示する時間 (ms)
--     "after_duration_ms": 1000,           -- 適用後を表示する時間 (ms)
--     "speed_columns_per_sec": 8           -- ウェーブの速度 (列/秒)
--   }
--
-- 既存の grid_data カラムは引き続き「素地 (before)」を保持する
-- (一般パネルではそのまま唯一のグリッドとして使われる)

ALTER TABLE zentai_gamen
  ADD COLUMN IF NOT EXISTS panel_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS motion_type text NULL,
  ADD COLUMN IF NOT EXISTS motion_data jsonb NULL;

-- 値域チェック
ALTER TABLE zentai_gamen
  DROP CONSTRAINT IF EXISTS zentai_gamen_panel_type_check;
ALTER TABLE zentai_gamen
  ADD CONSTRAINT zentai_gamen_panel_type_check
  CHECK (panel_type IN ('general', 'motion'));

ALTER TABLE zentai_gamen
  DROP CONSTRAINT IF EXISTS zentai_gamen_motion_type_check;
ALTER TABLE zentai_gamen
  ADD CONSTRAINT zentai_gamen_motion_type_check
  CHECK (motion_type IS NULL OR motion_type IN ('wave'));
