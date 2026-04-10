"use client";

import { useEffect, useRef, useState } from "react";

interface NodeDeleteMenuProps {
  x: number;
  y: number;
  nodeName: string;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onPlay: () => void;
  onClose: () => void;
}

export default function NodeDeleteMenu({
  x,
  y,
  nodeName,
  onDelete,
  onRename,
  onPlay,
  onClose,
}: NodeDeleteMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(nodeName);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose]);

  if (renaming) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-card border border-card-border rounded-lg shadow-xl p-3 min-w-[200px]"
        style={{ left: x, top: y }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              onRename(newName.trim());
              onClose();
            }
          }}
          className="w-full px-2 py-1.5 bg-background border border-card-border rounded text-sm text-foreground focus:outline-none focus:border-accent"
        />
        <div className="flex gap-2 mt-2 justify-end">
          <button
            onClick={() => setRenaming(false)}
            className="text-xs text-muted hover:text-foreground"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              if (newName.trim()) {
                onRename(newName.trim());
                onClose();
              }
            }}
            className="text-xs text-accent hover:opacity-80"
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-card border border-card-border rounded-lg shadow-xl py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      <div className="px-4 py-1.5 text-xs text-muted truncate border-b border-card-border">
        {nodeName}
      </div>
      <button
        onClick={onPlay}
        className="w-full px-4 py-2.5 text-sm text-accent hover:bg-accent/10 transition-colors text-left"
      >
        ▶ 再生
      </button>
      <button
        onClick={() => setRenaming(true)}
        className="w-full px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors text-left"
      >
        名前変更
      </button>
      <button
        onClick={onDelete}
        className="w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors text-left"
      >
        削除
      </button>
    </div>
  );
}
