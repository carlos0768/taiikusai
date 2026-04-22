-- Add music metadata & audio storage for projects
-- See CLAUDE.md "音楽ファイル取り込み" feature
--
-- music_data (jsonb):
--   {
--     "source_type": "youtube" | "file",
--     "video_id":    "<yt id>",        -- youtube のみ
--     "file_url":    "<public url>",   -- file のみ (再生用)
--     "file_path":   "<storage key>",  -- file のみ (削除用)
--     "file_name":   "<display>",      -- file のみ
--     "start_sec":   0,                -- トリム開始
--     "end_sec":     0,                -- トリム終了
--     "offset_sec":  0,                -- 移動 (タイムラインオフセット)
--     "duration":    0                 -- 総尺
--   }
--
-- 1 プロジェクト = 1 曲 (体育祭のパネル演技)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS music_data jsonb NULL;

-- Storage bucket: project-audio (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-audio', 'project-audio', true)
ON CONFLICT (id) DO NOTHING;

-- この project は supabase.auth を使わず anon で read/write しているため
-- storage.objects にも anon 向けの permissive policy を追加する
DROP POLICY IF EXISTS "project-audio public read" ON storage.objects;
CREATE POLICY "project-audio public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-audio');

DROP POLICY IF EXISTS "project-audio public insert" ON storage.objects;
CREATE POLICY "project-audio public insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-audio');

DROP POLICY IF EXISTS "project-audio public update" ON storage.objects;
CREATE POLICY "project-audio public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-audio');

DROP POLICY IF EXISTS "project-audio public delete" ON storage.objects;
CREATE POLICY "project-audio public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'project-audio');
