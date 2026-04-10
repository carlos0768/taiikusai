"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GridData } from "@/lib/grid/types";
import type { ColorIndex } from "@/lib/grid/types";
import { renderGrid, screenToGrid, type Viewport } from "./gridRenderer";
import type { Tool } from "./useGridState";

interface GridCanvasProps {
  gridRef: React.RefObject<GridData>;
  revision: number;
  viewport: Viewport;
  activeTool: Tool;
  activeColor: ColorIndex;
  selection: { x1: number; y1: number; x2: number; y2: number } | null;
  onPaintCell: (x: number, y: number, color: ColorIndex) => void;
  onStartBatchPaint: () => void;
  onBatchPaintCell: (x: number, y: number, color: ColorIndex) => void;
  onFloodFill: (x: number, y: number, color: ColorIndex) => void;
  onSelectionChange: (
    sel: { x1: number; y1: number; x2: number; y2: number } | null
  ) => void;
  onViewportChange: (viewport: Viewport) => void;
  isEditing: boolean;
}

export default function GridCanvas({
  gridRef,
  revision,
  viewport,
  activeTool,
  activeColor,
  selection,
  onPaintCell,
  onStartBatchPaint,
  onBatchPaintCell,
  onFloodFill,
  onSelectionChange,
  onViewportChange,
  isEditing,
}: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPaintingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const selStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const touchCountRef = useRef(0);
  const lastPinchDistRef = useRef<number | null>(null);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      sizeRef.current = { width, height };
      scheduleRender();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const grid = gridRef.current;
      if (!grid) return;
      renderGrid(
        ctx,
        grid,
        sizeRef.current.width,
        sizeRef.current.height,
        viewport,
        selection
      );
    });
  }, [viewport, selection, gridRef]);

  // Re-render on revision/viewport/selection changes
  useEffect(() => {
    scheduleRender();
  }, [revision, viewport, selection, scheduleRender]);

  const getGridCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return screenToGrid(
        x,
        y,
        sizeRef.current.width,
        sizeRef.current.height,
        gridRef.current!,
        viewport
      );
    },
    [viewport, gridRef]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Track touch count
      if (e.pointerType === "touch") {
        touchCountRef.current++;
      }

      // Multi-touch = pan/zoom, don't paint
      if (touchCountRef.current > 1) {
        isPaintingRef.current = false;
        isSelectingRef.current = false;
        return;
      }

      if (!isEditing) return;

      const cell = getGridCoords(e.clientX, e.clientY);
      if (!cell) return;

      if (activeTool === "paint" || activeTool === "eraser") {
        const color = activeTool === "eraser" ? 0 as ColorIndex : activeColor;
        isPaintingRef.current = true;
        lastPaintedCellRef.current = cell;
        onStartBatchPaint();
        onBatchPaintCell(cell.x, cell.y, color);
      } else if (activeTool === "bucket") {
        onFloodFill(cell.x, cell.y, activeColor);
      } else if (activeTool === "select") {
        isSelectingRef.current = true;
        selStartRef.current = cell;
        onSelectionChange({ x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y });
      }
    },
    [
      activeTool,
      activeColor,
      getGridCoords,
      onStartBatchPaint,
      onBatchPaintCell,
      onFloodFill,
      onSelectionChange,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (touchCountRef.current > 1) return;

      if (isPaintingRef.current && (activeTool === "paint" || activeTool === "eraser")) {
        const color = activeTool === "eraser" ? 0 as ColorIndex : activeColor;
        const cell = getGridCoords(e.clientX, e.clientY);
        if (
          cell &&
          (cell.x !== lastPaintedCellRef.current?.x ||
            cell.y !== lastPaintedCellRef.current?.y)
        ) {
          lastPaintedCellRef.current = cell;
          onBatchPaintCell(cell.x, cell.y, color);
        }
      }

      if (isSelectingRef.current && activeTool === "select" && selStartRef.current) {
        const cell = getGridCoords(e.clientX, e.clientY);
        if (cell) {
          onSelectionChange({
            x1: selStartRef.current.x,
            y1: selStartRef.current.y,
            x2: cell.x,
            y2: cell.y,
          });
        }
      }
    },
    [activeTool, activeColor, getGridCoords, onBatchPaintCell, onSelectionChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") {
        touchCountRef.current = Math.max(0, touchCountRef.current - 1);
      }
      isPaintingRef.current = false;
      isSelectingRef.current = false;
      lastPaintedCellRef.current = null;
      selStartRef.current = null;
    },
    []
  );

  // Multi-touch gestures for pinch zoom and pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchCountRef.current = e.touches.length;
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      lastPanRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        if (lastPinchDistRef.current !== null && lastPanRef.current !== null) {
          const scaleChange = dist / lastPinchDistRef.current;
          const newScale = Math.max(
            0.2,
            Math.min(5, viewport.scale * scaleChange)
          );
          const panDx = centerX - lastPanRef.current.x;
          const panDy = centerY - lastPanRef.current.y;

          onViewportChange({
            scale: newScale,
            translateX: viewport.translateX + panDx,
            translateY: viewport.translateY + panDy,
          });
        }

        lastPinchDistRef.current = dist;
        lastPanRef.current = { x: centerX, y: centerY };
      }
    },
    [viewport, onViewportChange]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchCountRef.current = e.touches.length;
    if (e.touches.length < 2) {
      lastPinchDistRef.current = null;
      lastPanRef.current = null;
    }
  }, []);

  return (
    <div ref={containerRef} className="flex-1 w-full relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}
