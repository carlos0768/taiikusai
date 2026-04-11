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
   * Move selected cells by (dx, dy).
   * selectedCells: Set of "x,y" strings identifying selected cells.
   * Source cells become white (0). Destination cells get the selected colors.
   */
  const moveSelection = useCallback(
    (selectedCells: Set<string>, dx: number, dy: number) => {
      const grid = gridRef.current;

      pushUndo();

      // Collect cell data
      const cells: { x: number; y: number; color: ColorIndex }[] = [];
      for (const key of selectedCells) {
        const [sx, sy] = key.split(",").map(Number);
        if (sx >= 0 && sx < grid.width && sy >= 0 && sy < grid.height) {
          cells.push({ x: sx, y: sy, color: getCell(grid, sx, sy) });
        }
      }

      // Clear source cells
      for (const { x, y } of cells) {
        setCell(grid, x, y, 0);
      }

      // Place at new position
      for (const { x, y, color } of cells) {
        const nx = x + dx;
        const ny = y + dy;
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
