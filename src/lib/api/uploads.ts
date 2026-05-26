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

/**
 * Upload any file straight from the browser to the `uploads` bucket.
 * Direct-to-storage (no server proxy) は最速の経路。
 * Returns the public URL and storage path (for later deletion).
 */
export async function uploadFile(file: File): Promise<{ url: string; path: string }> {
  const supabase = createClient();
  const path = `${randomId()}.${safeExt(file)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
