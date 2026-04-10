"use client";

import { useEffect, useRef } from "react";

interface NodeDeleteMenuProps {
  x: number;
  y: number;
  nodeName: string;
  onDelete: () => void;
  onClose: () => void;
}

export default function NodeDeleteMenu({
  x,
  y,
  nodeName,
  onDelete,
  onClose,
}: NodeDeleteMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose]);

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
        onClick={onDelete}
        className="w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors text-left"
      >
        削除
      </button>
    </div>
  );
}
