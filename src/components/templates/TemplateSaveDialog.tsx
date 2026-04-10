"use client";

import { useState } from "react";

interface TemplateSaveDialogProps {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function TemplateSaveDialog({
  onSave,
  onClose,
}: TemplateSaveDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-card-border rounded-lg shadow-xl p-6 w-80">
        <h3 className="text-lg font-semibold mb-4">テンプレートとして保存</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">
              テンプレート名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
              placeholder="名前を入力"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
