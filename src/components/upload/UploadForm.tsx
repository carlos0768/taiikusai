"use client";

import { useRef, useState } from "react";
import { uploadFile } from "@/lib/api/uploads";

type Status = "idle" | "uploading" | "done" | "error";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setFile(f);
    setStatus("idle");
    setError(null);
    setResult(null);
    setProgress(0);
  }

  async function handleUpload() {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    setProgress(0);
    try {
      const { url } = await uploadFile(file, (f) => setProgress(f));
      setResult({ url });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
      setStatus("error");
    }
  }

  const uploading = status === "uploading";

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-center mb-1">アップロード</h1>
      <p className="text-muted text-center text-sm mb-6">
        ファイルを選択してアップロード
      </p>

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (uploading) return;
          const f = e.dataTransfer.files?.[0];
          if (f) pick(f);
        }}
        className={`cursor-pointer border-2 border-dashed rounded-lg px-4 py-10 text-center transition-colors ${
          dragOver ? "border-accent bg-accent/10" : "border-card-border"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {file ? (
          <div className="space-y-1">
            <p className="font-medium break-all">{file.name}</p>
            <p className="text-muted text-sm">{formatSize(file.size)}</p>
          </div>
        ) : (
          <p className="text-muted text-sm">
            ここにドラッグ＆ドロップ、またはタップして選択
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>

      {uploading && (
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-card-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-muted text-xs mt-1 text-right">
            {Math.round(progress * 100)}%
          </p>
        </div>
      )}

      {error && <p className="text-danger text-sm mt-4">{error}</p>}

      {result && (
        <div className="mt-4 text-sm">
          <p className="text-accent font-medium mb-1">アップロード完了</p>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline break-all"
          >
            {result.url}
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-6 w-full py-2 bg-accent text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {uploading ? "アップロード中..." : "アップロード"}
      </button>
    </div>
  );
}
