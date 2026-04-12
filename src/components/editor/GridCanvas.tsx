"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GridData } from "@/lib/grid/types";
import { UNDEFINED_COLOR, type ColorIndex } from "@/lib/grid/types";
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
  onMoveSelection: (selectedCells: Set<string>, dx: number, dy: number) => void;
  moveSelectedCells: Set<string>;
  onMoveSelectedCellsChange: (cells: Set<string>) => void;
  moveDragOffset: { dx: number; dy: number } | null;
  onMoveDragOffsetChange: (offset: { dx: number; dy: number } | null) => void;
  isMoveSelecting: boolean;
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
  moveSelectedCells,
  onMoveSelectedCellsChange,
  moveDragOffset,
  onMoveDragOffsetChange,
  isMoveSelecting,
}: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPaintingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const isDraggingMoveRef = useRef(false);
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const isRemovingRef = useRef(false); // true if first tap was a remove (toggle off)
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
        selection,
        moveSelectedCells,
        moveDragOffset
      );
    });
  }, [viewport, selection, moveSelectedCells, moveDragOffset, gridRef]);

  // Re-render on revision/viewport/selection/moveSelectedCells/offset changes
  useEffect(() => {
    scheduleRender();
  }, [revision, viewport, selection, moveSelectedCells, moveDragOffset, scheduleRender]);

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
        const color = activeTool === "eraser" ? UNDEFINED_COLOR : activeColor;
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
        const key = `${cell.x},${cell.y}`;
        if (isMoveSelecting) {
          isSelectingRef.current = true;
          const newSet = new Set(moveSelectedCells);
          if (newSet.has(key)) {
            newSet.delete(key);
            isRemovingRef.current = true; // dragging will remove cells
          } else {
            newSet.add(key);
            isRemovingRef.current = false; // dragging will add cells
          }
          onMoveSelectedCellsChange(newSet);
        } else if (moveSelectedCells.has(key)) {
          // Not selecting, click inside selection → start drag move
          isDraggingMoveRef.current = true;
          moveStartRef.current = cell;
          onMoveDragOffsetChange({ dx: 0, dy: 0 });
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
      moveSelectedCells,
      onMoveSelectedCellsChange,
      isMoveSelecting,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (touchCountRef.current > 1) return;

      if (isPaintingRef.current && (activeTool === "paint" || activeTool === "eraser")) {
        const color = activeTool === "eraser" ? UNDEFINED_COLOR : activeColor;
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

      // Free selection for move tool: add or remove cells as pointer moves
      if (isSelectingRef.current && activeTool === "move") {
        const cell = getGridCoords(e.clientX, e.clientY);
        if (cell) {
          const key = `${cell.x},${cell.y}`;
          if (isRemovingRef.current) {
            if (moveSelectedCells.has(key)) {
              const newSet = new Set(moveSelectedCells);
              newSet.delete(key);
              onMoveSelectedCellsChange(newSet);
            }
          } else {
            if (!moveSelectedCells.has(key)) {
              const newSet = new Set(moveSelectedCells);
              newSet.add(key);
              onMoveSelectedCellsChange(newSet);
            }
          }
        }
      }

      // Drag preview for move tool: update offset in real-time
      if (isDraggingMoveRef.current && moveStartRef.current && activeTool === "move") {
        const cell = getGridCoords(e.clientX, e.clientY);
        if (cell) {
          onMoveDragOffsetChange({
            dx: cell.x - moveStartRef.current.x,
            dy: cell.y - moveStartRef.current.y,
          });
        }
      }
    },
    [activeTool, activeColor, getGridCoords, onBatchPaintCell, onSelectionChange, moveSelectedCells, onMoveSelectedCellsChange, onMoveDragOffsetChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") {
        touchCountRef.current = Math.max(0, touchCountRef.current - 1);
      }

      // Finish move drag
      if (isDraggingMoveRef.current && moveStartRef.current && moveSelectedCells.size > 0) {
        const cell = getGridCoords(e.clientX, e.clientY);
        if (cell) {
          const dx = cell.x - moveStartRef.current.x;
          const dy = cell.y - moveStartRef.current.y;
          if (dx !== 0 || dy !== 0) {
            onMoveSelection(moveSelectedCells, dx, dy);
            // Update selected cells to new positions
            const newSet = new Set<string>();
            for (const key of moveSelectedCells) {
              const [sx, sy] = key.split(",").map(Number);
              newSet.add(`${sx + dx},${sy + dy}`);
            }
            onMoveSelectedCellsChange(newSet);
          }
        }
        isDraggingMoveRef.current = false;
        moveStartRef.current = null;
        onMoveDragOffsetChange(null);
      }
      isPaintingRef.current = false;
      isSelectingRef.current = false;
      lastPaintedCellRef.current = null;
      selStartRef.current = null;
    },
    [getGridCoords, moveSelectedCells, onMoveSelection, onMoveSelectedCellsChange, onMoveDragOffsetChange]
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
