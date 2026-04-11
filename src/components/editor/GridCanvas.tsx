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
  onMoveSelection: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dx: number,
    dy: number
  ) => void;
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
  onMoveSelection,
}: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPaintingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const isDraggingMoveRef = useRef(false);
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
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

      if (!isEditing && activeTool !== "move") return;

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
      } else if (activeTool === "move") {
        if (selection) {
          // Check if click is inside existing selection → start drag
          const minX = Math.min(selection.x1, selection.x2);
          const maxX = Math.max(selection.x1, selection.x2);
          const minY = Math.min(selection.y1, selection.y2);
          const maxY = Math.max(selection.y1, selection.y2);
          if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) {
            isDraggingMoveRef.current = true;
            moveStartRef.current = cell;
          } else {
            // Click outside → start new selection
            isSelectingRef.current = true;
            selStartRef.current = cell;
            onSelectionChange({ x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y });
          }
        } else {
          // No selection yet → start selecting
          isSelectingRef.current = true;
          selStartRef.current = cell;
          onSelectionChange({ x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y });
        }
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

      if (isSelectingRef.current && (activeTool === "select" || activeTool === "move") && selStartRef.current) {
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

      // Finish move drag
      if (isDraggingMoveRef.current && moveStartRef.current && selection) {
        const cell = getGridCoords(e.clientX, e.clientY);
        if (cell) {
          const dx = cell.x - moveStartRef.current.x;
          const dy = cell.y - moveStartRef.current.y;
          if (dx !== 0 || dy !== 0) {
            onMoveSelection(
              selection.x1,
              selection.y1,
              selection.x2,
              selection.y2,
              dx,
              dy
            );
            // Update selection to new position
            onSelectionChange({
              x1: selection.x1 + dx,
              y1: selection.y1 + dy,
              x2: selection.x2 + dx,
              y2: selection.y2 + dy,
            });
          }
        }
        isDraggingMoveRef.current = false;
        moveStartRef.current = null;
      }
      isPaintingRef.current = false;
      isSelectingRef.current = false;
      lastPaintedCellRef.current = null;
      selStartRef.current = null;
    },
    [getGridCoords, selection, onMoveSelection, onSelectionChange]
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
