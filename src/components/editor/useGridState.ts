"use client";

import { useCallback, useRef, useState } from "react";
import {
  type ColorIndex,
  type GridData,
  cloneGrid,
  createEmptyGrid,
  getCell,
  setCell,
} from "@/lib/grid/types";

export type Tool = "paint" | "bucket" | "select" | "eraser" | "move";

const MAX_UNDO = 100;

export function useGridState(initialGrid: GridData) {
  const gridRef = useRef<GridData>(initialGrid);
  const undoStackRef = useRef<GridData[]>([]);
  const redoStackRef = useRef<GridData[]>([]);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);

  const bump = useCallback(() => {
    setRevision((r) => r + 1);
    setDirty(true);
  }, []);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(cloneGrid(gridRef.current));
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const paintCell = useCallback(
    (x: number, y: number, color: ColorIndex) => {
      const grid = gridRef.current;
      if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return;
      if (getCell(grid, x, y) === color) return;
      pushUndo();
      setCell(grid, x, y, color);
      bump();
    },
    [pushUndo, bump]
  );

  // Batch paint without pushing undo for each cell (for drag painting)
  const startBatchPaint = useCallback(() => {
    pushUndo();
  }, [pushUndo]);

  const batchPaintCell = useCallback(
    (x: number, y: number, color: ColorIndex) => {
      const grid = gridRef.current;
      if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return;
      setCell(grid, x, y, color);
      bump();
    },
    [bump]
  );

  const floodFill = useCallback(
    (startX: number, startY: number, color: ColorIndex) => {
      const grid = gridRef.current;
      if (startX < 0 || startX >= grid.width || startY < 0 || startY >= grid.height) return;
      const targetColor = getCell(grid, startX, startY);
      if (targetColor === color) return;

      pushUndo();

      const stack: [number, number][] = [[startX, startY]];
      const visited = new Set<number>();

      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        const idx = y * grid.width + x;
        if (visited.has(idx)) continue;
        if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) continue;
        if (getCell(grid, x, y) !== targetColor) continue;

        visited.add(idx);
        setCell(grid, x, y, color);

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }

      bump();
    },
    [pushUndo, bump]
  );

  const rectFill = useCallback(
    (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: ColorIndex
    ) => {
      const grid = gridRef.current;
      const minX = Math.max(0, Math.min(x1, x2));
      const maxX = Math.min(grid.width - 1, Math.max(x1, x2));
      const minY = Math.max(0, Math.min(y1, y2));
      const maxY = Math.min(grid.height - 1, Math.max(y1, y2));

      pushUndo();

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          setCell(grid, x, y, color);
        }
      }

      bump();
    },
    [pushUndo, bump]
  );

  /**
   * Move a selected region by (dx, dy) cells.
   * Source cells become white (0). Destination cells get the selected colors.
   * Cells outside the grid are clipped.
   */
  const moveSelection = useCallback(
    (
      selX1: number,
      selY1: number,
      selX2: number,
      selY2: number,
      dx: number,
      dy: number
    ) => {
      const grid = gridRef.current;
      const minX = Math.max(0, Math.min(selX1, selX2));
      const maxX = Math.min(grid.width - 1, Math.max(selX1, selX2));
      const minY = Math.max(0, Math.min(selY1, selY2));
      const maxY = Math.min(grid.height - 1, Math.max(selY1, selY2));

      pushUndo();

      // Copy selected cells
      const copied: { rx: number; ry: number; color: ColorIndex }[] = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          copied.push({ rx: x - minX, ry: y - minY, color: getCell(grid, x, y) });
        }
      }

      // Clear source area (set to white)
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          setCell(grid, x, y, 0);
        }
      }

      // Place at new position
      const newMinX = minX + dx;
      const newMinY = minY + dy;
      for (const { rx, ry, color } of copied) {
        const nx = newMinX + rx;
        const ny = newMinY + ry;
        if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
          setCell(grid, nx, ny, color);
        }
      }

      bump();
    },
    [pushUndo, bump]
  );

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(cloneGrid(gridRef.current));
    gridRef.current = prev;
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(cloneGrid(gridRef.current));
    gridRef.current = next;
    bump();
  }, [bump]);

  const loadGrid = useCallback((grid: GridData) => {
    gridRef.current = grid;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setRevision(0);
    setDirty(false);
  }, []);

  const clearDirty = useCallback(() => {
    setDirty(false);
  }, []);

  return {
    gridRef,
    revision,
    dirty,
    paintCell,
    startBatchPaint,
    batchPaintCell,
    floodFill,
    rectFill,
    moveSelection,
    undo,
    redo,
    loadGrid,
    clearDirty,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
