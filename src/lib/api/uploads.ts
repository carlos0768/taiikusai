import { createClient } from "@/lib/supabase/client";

const BUCKET = "uploads";

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

function parseError(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText);
    return body.message || body.error || `アップロードに失敗しました (${xhr.status})`;
  } catch {
    return `アップロードに失敗しました (${xhr.status})`;
  }
}

/**
 * Upload any file straight from the browser to the `uploads` bucket as a
 * single continuous stream (XHR)。
 *
 * チャンク分割せず1本のリクエストで送るため、チャンク間の待ち時間が無く
 * 回線帯域を使い切れる (低遅延環境では単一接続でも上り帯域に張り付く)。
 * サーバーは経由しない直送経路。
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

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const path = `${randomId()}.${safeExt(file)}`;
  const endpoint = `${baseUrl}/storage/v1/object/${BUCKET}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    if (file.type) xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(parseError(xhr)));
    };
    xhr.onerror = () => reject(new Error("ネットワークエラーが発生しました"));
    xhr.onabort = () => reject(new Error("アップロードが中断されました"));

    xhr.send(file);
  });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
