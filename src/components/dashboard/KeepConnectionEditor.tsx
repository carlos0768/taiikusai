"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import {
  createKeepMaskGrid,
  isKeepEligibleSameColorCell,
  normalizeKeepMaskGrid,
} from "@/lib/keep";

interface KeepConnectionEditorProps {
  sourceName: string;
  targetName: string;
  sourceGrid: GridData;
  targetGrid: GridData;
  initialMask: GridData;
  canEdit: boolean;
  onSave: (mask: GridData) => Promise<void>;
  onClose: () => void;
}

function getCanvasCellIndex(
  event: React.PointerEvent<HTMLCanvasElement>,
  grid: GridData
): number | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * grid.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * grid.height);

  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    return null;
  }

  return y * grid.width + x;
}

function drawDiagonalHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  spacing: number,
  color: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  for (let offset = -height; offset < width; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + height);
    ctx.lineTo(x + offset + height, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGridWithMask(
  canvas: HTMLCanvasElement,
  grid: GridData,
  sourceGrid: GridData,
  targetGrid: GridData,
  mask: GridData
) {
  const width = 520;
  const height = Math.round((grid.height / grid.width) * width);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cellW = width / grid.width;
  const cellH = height / grid.height;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      const px = x * cellW;
      const py = y * cellH;
      const colorIdx = grid.cells[index] as ColorIndex;
      const selectable = isKeepEligibleSameColorCell(
        sourceGrid.cells[index],
        targetGrid.cells[index]
      );
      const selected = mask.cells[index] === 1;

      ctx.fillStyle = COLOR_MAP[colorIdx];
      ctx.fillRect(px, py, Math.ceil(cellW), Math.ceil(cellH));

      if (!selectable) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
        ctx.fillRect(px, py, Math.ceil(cellW), Math.ceil(cellH));
        drawDiagonalHatch(
          ctx,
          px,
          py,
          cellW,
          cellH,
          Math.max(6, Math.min(cellW, cellH) / 2),
          "rgba(255, 255, 255, 0.18)"
        );
      } else if (selected) {
        ctx.fillStyle = "rgba(0, 229, 255, 0.34)";
        ctx.fillRect(px, py, Math.ceil(cellW), Math.ceil(cellH));
        drawDiagonalHatch(
          ctx,
          px,
          py,
          cellW,
          cellH,
          Math.max(7, Math.min(cellW, cellH) / 2),
          "rgba(255, 255, 255, 0.52)"
        );
        ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        ctx.lineWidth = 3;
        ctx.strokeRect(
          px + 1.5,
          py + 1.5,
          Math.max(1, cellW - 3),
          Math.max(1, cellH - 3)
        );
        ctx.strokeStyle = "rgba(0, 229, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          px + 4,
          py + 4,
          Math.max(1, cellW - 8),
          Math.max(1, cellH - 8)
        );
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(px, py, Math.ceil(cellW), Math.ceil(cellH));
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(255, 215, 0, 0.72)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          px + 2,
          py + 2,
          Math.max(1, cellW - 4),
          Math.max(1, cellH - 4)
        );
        ctx.setLineDash([]);
      }
    }
  }

  ctx.strokeStyle = "rgba(128, 128, 128, 0.18)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= grid.width; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * cellW, 0);
    ctx.lineTo(x * cellW, height);
    ctx.stroke();
  }
  for (let y = 0; y <= grid.height; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellH);
    ctx.lineTo(width, y * cellH);
    ctx.stroke();
  }
}

function LegendSwatch({ kind }: { kind: "available" | "selected" | "disabled" }) {
  const className =
    kind === "selected"
      ? "border-cyan-300 bg-cyan-300/35"
      : kind === "available"
        ? "border-accent bg-white/10"
        : "border-white/20 bg-black/50";

  return (
    <span
      className={`inline-block h-4 w-4 rounded-sm border ${className}`}
      aria-hidden="true"
    />
  );
}

export default function KeepConnectionEditor({
  sourceName,
  targetName,
  sourceGrid,
  targetGrid,
  initialMask,
  canEdit,
  onSave,
  onClose,
}: KeepConnectionEditorProps) {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const targetCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragValueRef = useRef<0 | 1 | null>(null);
  const [mask, setMask] = useState(() => normalizeKeepMaskGrid(initialMask));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectableCells = useMemo(() => {
    const cells = new Uint8Array(sourceGrid.width * sourceGrid.height);
    const maxLength = Math.min(
      cells.length,
      sourceGrid.cells.length,
      targetGrid.cells.length
    );
    for (let index = 0; index < maxLength; index += 1) {
      cells[index] = isKeepEligibleSameColorCell(
        sourceGrid.cells[index],
        targetGrid.cells[index]
      )
        ? 1
        : 0;
    }
    return cells;
  }, [sourceGrid, targetGrid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMask(() => {
      const normalized = normalizeKeepMaskGrid(initialMask);
      for (let index = 0; index < normalized.cells.length; index += 1) {
        if (selectableCells[index] !== 1) {
          normalized.cells[index] = 0;
        }
      }
      return normalized;
    });
    setDirty(false);
  }, [initialMask, selectableCells]);

  useEffect(() => {
    if (sourceCanvasRef.current) {
      drawGridWithMask(
        sourceCanvasRef.current,
        sourceGrid,
        sourceGrid,
        targetGrid,
        mask
      );
    }
    if (targetCanvasRef.current) {
      drawGridWithMask(
        targetCanvasRef.current,
        targetGrid,
        sourceGrid,
        targetGrid,
        mask
      );
    }
  }, [mask, sourceGrid, targetGrid]);

  const applyCellValue = useCallback(
    (index: number, value: 0 | 1) => {
      if (!canEdit || selectableCells[index] !== 1) return;

      setMask((current) => {
        if (current.cells[index] === value) return current;

        const next = normalizeKeepMaskGrid(current);
        next.cells[index] = value;
        setDirty(true);
        return next;
      });
    },
    [canEdit, selectableCells]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canEdit) return;
      const index = getCanvasCellIndex(event, sourceGrid);
      if (index === null || selectableCells[index] !== 1) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      const nextValue: 0 | 1 = mask.cells[index] === 1 ? 0 : 1;
      dragValueRef.current = nextValue;
      applyCellValue(index, nextValue);
    },
    [applyCellValue, canEdit, mask.cells, selectableCells, sourceGrid]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const value = dragValueRef.current;
      if (value === null) return;

      const index = getCanvasCellIndex(event, sourceGrid);
      if (index === null) return;
      applyCellValue(index, value);
    },
    [applyCellValue, sourceGrid]
  );

  const handlePointerEnd = useCallback(() => {
    dragValueRef.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      await onSave(mask);
      setDirty(false);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [canEdit, mask, onClose, onSave, saving]);

  const handleSaveDisabled = useCallback(async () => {
    if (!canEdit || saving) return;
    const disabledMask = createKeepMaskGrid(sourceGrid.width, sourceGrid.height);
    setSaving(true);
    try {
      await onSave(disabledMask);
      setMask(disabledMask);
      setDirty(false);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [canEdit, onClose, onSave, saving, sourceGrid.height, sourceGrid.width]);

  const enabledCount = useMemo(() => {
    let count = 0;
    for (let index = 0; index < mask.cells.length; index += 1) {
      if (mask.cells[index] === 1) count += 1;
    }
    return count;
  }, [mask]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-card-border bg-card/95 px-4 py-3 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-foreground">keep表示</h2>
            <p className="text-xs text-muted">
              同じ位置で同色のセルだけ、接続間隔中に source 色を保持できます
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch kind="available" />
                keep可能
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch kind="selected" />
                keep ON
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendSwatch kind="disabled" />
                keep不可
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-background hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{sourceName}</h3>
              <span className="text-xs text-muted">source</span>
            </div>
            <div className="overflow-auto rounded-xl border border-card-border bg-background/70 p-3">
              <canvas
                ref={sourceCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                className={canEdit ? "cursor-crosshair" : "cursor-not-allowed"}
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{targetName}</h3>
              <span className="text-xs text-muted">target</span>
            </div>
            <div className="overflow-auto rounded-xl border border-card-border bg-background/70 p-3">
              <canvas
                ref={targetCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                className={canEdit ? "cursor-crosshair" : "cursor-not-allowed"}
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-card-border bg-card/95 px-4 py-3 backdrop-blur">
          <span className="text-xs text-muted">
            keep ON: {enabledCount}セル{dirty ? " / 未保存" : ""}
          </span>
          <div className="flex gap-2">
            {canEdit && (
              <button
                onClick={handleSaveDisabled}
                disabled={saving}
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                この間隔のkeepをOFF
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground"
            >
              閉じる
            </button>
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
