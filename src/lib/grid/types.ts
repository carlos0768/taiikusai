export type ColorIndex = 0 | 1 | 2 | 3 | 4;

export const COLOR_MAP: Record<ColorIndex, string> = {
  0: "#FFFFFF", // white (fold / default)
  1: "#FFD700", // yellow
  2: "#FF0000", // red
  3: "#000000", // black
  4: "#0000FF", // blue
} as const;

export const COLOR_NAMES: Record<ColorIndex, string> = {
  0: "白",
  1: "黄",
  2: "赤",
  3: "黒",
  4: "青",
} as const;

export const NUM_COLORS = 5;

export interface GridData {
  width: number;
  height: number;
  cells: Uint8Array;
}

export function createEmptyGrid(width: number, height: number): GridData {
  return {
    width,
    height,
    cells: new Uint8Array(width * height), // all zeros = white
  };
}

export function getCell(grid: GridData, x: number, y: number): ColorIndex {
  return grid.cells[y * grid.width + x] as ColorIndex;
}

export function setCell(
  grid: GridData,
  x: number,
  y: number,
  color: ColorIndex
): void {
  grid.cells[y * grid.width + x] = color;
}

export function cloneGrid(grid: GridData): GridData {
  return {
    width: grid.width,
    height: grid.height,
    cells: new Uint8Array(grid.cells),
  };
}
