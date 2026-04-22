"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid } from "@/lib/grid/codec";
import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";
import type { Template } from "@/types";

interface TemplateGridProps {
  onSelect?: (template: Template) => void;
  showDelete?: boolean;
}

function TemplateCard({
  template,
  onSelect,
  onDelete,
}: {
  template: Template;
  onSelect?: (t: Template) => void;
  onDelete?: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = decodeGrid(
      template.grid_data,
      template.grid_width,
      template.grid_height
    );
    const w = 160;
    const h = Math.round((template.grid_height / template.grid_width) * w);
    canvas.width = w;
    canvas.height = h;
    const cellW = w / grid.width;
    const cellH = h / grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const idx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[idx];
        ctx.fillRect(
          x * cellW,
          y * cellH,
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      }
    }
  }, [template]);

  return (
    <div
      className="bg-card border border-card-border rounded-lg overflow-hidden hover:border-accent/50 transition-colors cursor-pointer"
      onClick={() => onSelect?.(template)}
    >
      <div className="p-2 bg-background/50">
        <canvas
          ref={canvasRef}
          className="w-full rounded"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm truncate">{template.name}</span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(template.id);
            }}
            className="text-xs text-muted hover:text-danger transition-colors ml-2 shrink-0"
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}

export default function TemplateGrid({
  onSelect,
  showDelete = true,
}: TemplateGridProps) {
  const [supabase] = useState(() => createClient());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      let query = supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (search.trim()) {
        query = query.ilike("name", `%${search.trim()}%`);
      }

      const { data } = await query;
      if (cancelled) return;
      setTemplates((data ?? []) as Template[]);
      setLoading(false);
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [search, supabase]);

  async function handleDelete(id: string) {
    await supabase.from("templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="テンプレートを検索..."
        className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
      />

      {loading && <p className="text-muted text-center py-8">読み込み中...</p>}

      {!loading && templates.length === 0 && (
        <p className="text-muted text-center py-8">
          {search ? "検索結果がありません" : "テンプレートがありません"}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onSelect={onSelect}
            onDelete={showDelete ? handleDelete : undefined}
          />
        ))}
      </div>
    </div>
  );
}
