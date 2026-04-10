"use client";

import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onManual: () => void;
  onTemplate: () => void;
  onExisting: () => void;
  onImport: () => void;
  onScan: () => void;
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  onManual,
  onTemplate,
  onExisting,
  onImport,
  onScan,
  onClose,
}: ContextMenuProps) {
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

  const items = [
    { label: "スキャン", action: onScan, arrow: false },
    { label: "手動", action: onManual, arrow: false },
    { label: "テンプレ", action: onTemplate, arrow: true },
    { label: "既存", action: onExisting, arrow: true },
    { label: "インポート", action: onImport, arrow: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-card border border-card-border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors"
        >
          <span>{item.label}</span>
          {item.arrow && <span className="text-muted text-xs">▶</span>}
        </button>
      ))}
    </div>
  );
}
