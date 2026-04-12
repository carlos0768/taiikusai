"use client";

import { useEffect, useRef, useState } from "react";

export interface SubMenuItem {
  id: string;
  label: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onManual: () => void;
  onWave: () => void;
  onScan: () => void;
  onSelectTemplate: (templateId: string) => void;
  onSelectExisting: (zentaiGamenId: string) => void;
  onImportFile: (type: "xlsx" | "csv") => void;
  onClose: () => void;
  templates: SubMenuItem[];
  existingDesigns: SubMenuItem[];
}

type SubmenuType = "template" | "existing" | "import" | null;

export default function ContextMenu({
  x,
  y,
  onManual,
  onWave,
  onScan,
  onSelectTemplate,
  onSelectExisting,
  onImportFile,
  onClose,
  templates,
  existingDesigns,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>(null);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [onClose]);

  const importOptions: SubMenuItem[] = [
    { id: "xlsx", label: "Excel (.xlsx)" },
    { id: "csv", label: "CSV (.csv)" },
  ];

  const submenuItems: Record<string, SubMenuItem[]> = {
    template: templates,
    existing: existingDesigns,
    import: importOptions,
  };

  const handleSubmenuSelect = (type: SubmenuType, itemId: string) => {
    if (type === "template") onSelectTemplate(itemId);
    else if (type === "existing") onSelectExisting(itemId);
    else if (type === "import") onImportFile(itemId as "xlsx" | "csv");
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex"
      style={{ left: x, top: y }}
    >
      {/* Main menu */}
      <div className="bg-card border border-card-border rounded-lg shadow-xl py-1 min-w-[160px]">
        <button
          onClick={onScan}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors"
        >
          <span>スキャン</span>
        </button>
        <button
          onClick={onManual}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors"
        >
          <span>手動</span>
        </button>
        <button
          onClick={onWave}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors"
        >
          <span>ウェーブ</span>
          <span className="text-[10px] text-accent">〜</span>
        </button>

        {(["template", "existing", "import"] as const).map((type) => {
          const label =
            type === "template"
              ? "テンプレ"
              : type === "existing"
                ? "既存"
                : "インポート";
          return (
            <button
              key={type}
              onClick={() =>
                setActiveSubmenu(activeSubmenu === type ? null : type)
              }
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                activeSubmenu === type
                  ? "bg-accent/10 text-accent"
                  : "text-foreground hover:bg-accent/10"
              }`}
            >
              <span>{label}</span>
              <span className="text-xs">▶</span>
            </button>
          );
        })}
      </div>

      {/* Submenu */}
      {activeSubmenu && (
        <div className="ml-1 bg-card border border-card-border rounded-lg shadow-xl py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
          {submenuItems[activeSubmenu].length === 0 ? (
            <div className="px-4 py-2.5 text-sm text-muted">
              {activeSubmenu === "template"
                ? "テンプレートがありません"
                : "デザインがありません"}
            </div>
          ) : (
            submenuItems[activeSubmenu].map((item) => (
              <button
                key={item.id}
                onClick={() => handleSubmenuSelect(activeSubmenu, item.id)}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent/10 transition-colors truncate"
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
