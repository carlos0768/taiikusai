import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "uploads";
// Supabase の resumable upload はチャンクサイズ 6MB 固定が必須
const CHUNK_SIZE = 6 * 1024 * 1024;

function safeExt(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }
  const fromType = file.type.split("/")[1];
  return (fromType || "bin").toLowerCase();
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Upload any file straight from the browser to the `uploads` bucket using
 * Supabase の resumable upload (TUS)。大容量ファイル (動画など) を分割送信し、
 * ネットワークが途切れても再開できる。サーバーを経由しない直送経路。
 *
 * @param onProgress 0..1 の進捗を返すコールバック (任意)
 */
export async function uploadFile(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<{ url: string; path: string }> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("ログインセッションがありません。再ログインしてください。");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const path = `${randomId()}.${safeExt(file)}`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${url}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 4000, 8000, 16000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (uploaded, total) => {
        if (onProgress && total > 0) onProgress(uploaded / total);
      },
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    });
  });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
