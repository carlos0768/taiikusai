import { createClient } from "@/lib/supabase/client";

const BUCKET = "project-audio";

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type.split("/")[1];
  return (fromType || "bin").toLowerCase();
}

/**
 * Upload an audio file to the project-audio bucket.
 * Returns the public URL and the storage path (used for later deletion).
 */
export async function uploadProjectAudio(
  projectId: string,
  file: File
): Promise<{ url: string; path: string }> {
  const supabase = createClient();
  const ext = extFromFile(file);
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${projectId}/${uuid}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Delete an audio file from the project-audio bucket.
 * Best-effort — errors are swallowed so callers can proceed.
 */
export async function deleteProjectAudio(path: string): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // ignore — deletion is best-effort
  }
}
