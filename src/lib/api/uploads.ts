const PART_SIZE = 10 * 1024 * 1024; // 10MB/part (S3 最小は 5MB、最後尾を除く)
const CONCURRENCY = 6; // ブラウザの同一ホスト同時接続上限に合わせる

async function postJson<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/uploads/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `アップロードに失敗しました (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * Upload any file straight from the browser using S3 multipart：
 * ファイルを 10MB のパートに分割し、presigned URL へ複数同時に PUT する。
 * 並列送信で単一接続の頭打ちを超え、上り帯域を使い切る。ファイル本体は
 * 各 presigned URL へ直送され、サーバーは制御メッセージのみ扱う。
 *
 * @param onProgress 0..1 の進捗を返すコールバック (任意)
 */
export async function uploadFile(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<{ url: string; path: string }> {
  const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE));

  const { key, uploadId, partUrls } = await postJson<{
    key: string;
    uploadId: string;
    partUrls: string[];
  }>({
    action: "create",
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    partCount,
  });

  try {
    const uploadedBytes = new Array<number>(partCount).fill(0);
    const reportProgress = () => {
      if (!onProgress) return;
      const total = uploadedBytes.reduce((a, b) => a + b, 0);
      onProgress(Math.min(1, total / file.size));
    };

    let next = 0;
    async function worker() {
      while (next < partCount) {
        const index = next++;
        const start = index * PART_SIZE;
        const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));
        await putPart(partUrls[index], blob, (loaded) => {
          uploadedBytes[index] = loaded;
          reportProgress();
        });
        uploadedBytes[index] = blob.size;
        reportProgress();
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, partCount) }, worker)
    );

    return await postJson<{ url: string; path: string }>({
      action: "complete",
      key,
      uploadId,
    });
  } catch (err) {
    // 失敗時はベストエフォートで中断 (滞留パートのクリーンアップ)
    void postJson({ action: "abort", key, uploadId }).catch(() => {});
    throw err;
  }
}

function putPart(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`パートのアップロードに失敗しました (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("ネットワークエラーが発生しました"));
    xhr.onabort = () => reject(new Error("アップロードが中断されました"));
    xhr.send(blob);
  });
}
