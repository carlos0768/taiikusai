"use client";

import { useCallback, useState } from "react";

interface AiSpriteDialogProps {
  onGenerate: (prompt: string) => Promise<void>;
  onClose: () => void;
}

export default function AiSpriteDialog({
  onGenerate,
  onClose,
}: AiSpriteDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedPrompt = prompt.trim();

      if (!trimmedPrompt) {
        setError("描きたい内容を入力してください");
        return;
      }

      setError(null);
      setGenerating(true);
      try {
        await onGenerate(trimmedPrompt);
      } catch (generateError) {
        setError(
          generateError instanceof Error
            ? generateError.message
            : "AI描画に失敗しました"
        );
      } finally {
        setGenerating(false);
      }
    },
    [onGenerate, prompt]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl border border-card-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            AIピクセル描画
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="px-2 py-1 text-lg leading-none text-muted hover:text-foreground disabled:opacity-40"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <label className="mt-4 block text-xs text-muted">描きたいもの</label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          autoFocus
          placeholder="例: 黒い輪郭の三毛猫、赤いハチマキの走者、青い龍"
          className="mt-1 w-full resize-none rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
        />

        {error && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {generating ? "生成中..." : "生成"}
          </button>
        </div>
      </form>
    </div>
  );
}
