-- Generic file upload bucket
-- 任意のファイルを直接アップロードするための汎用バケット。
-- ページ (/upload) はログイン必須なので insert/update/delete は
-- authenticated ロールに限定し、read のみ public とする。

-- file_size_limit を null にして大きな動画 (5分動画など) も受け付ける
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, null)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "uploads public read" ON storage.objects;
CREATE POLICY "uploads public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads authenticated insert" ON storage.objects;
CREATE POLICY "uploads authenticated insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads authenticated update" ON storage.objects;
CREATE POLICY "uploads authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads authenticated delete" ON storage.objects;
CREATE POLICY "uploads authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads');
