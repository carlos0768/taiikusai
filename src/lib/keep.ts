import { createFilledGrid, type GridData } from "@/lib/grid/types";

export function isKeepMaskSelected(value: number): boolean {
  return value === 1;
}

export function createKeepMaskGrid(width: number, height: number): GridData {
  return createFilledGrid(width, height, 0);
}

export function normalizeKeepMaskGrid(grid: GridData): GridData {
  const normalized = createKeepMaskGrid(grid.width, grid.height);
  for (let index = 0; index < grid.cells.length; index++) {
    normalized.cells[index] = isKeepMaskSelected(grid.cells[index]) ? 1 : 0;
  }
  return normalized;
}

export function getKeepSelectedCells(mask: GridData): Set<string> {
  const selected = new Set<string>();

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (isKeepMaskSelected(mask.cells[y * mask.width + x])) {
        selected.add(`${x},${y}`);
      }
    }
  }

  return selected;
}

export function buildKeepMaskFromSelectedCells(
  width: number,
  height: number,
  selectedCells: Set<string>
): GridData {
  const mask = createKeepMaskGrid(width, height);

  for (const key of selectedCells) {
    const [x, y] = key.split(",").map(Number);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    mask.cells[y * width + x] = 1;
  }

  return mask;
}

export function resolveKeepDisplayGrid(
  previousVisibleGrid: GridData | null,
  mask: GridData
): GridData {
  const displayGrid = createFilledGrid(mask.width, mask.height, 0);
  if (!previousVisibleGrid) return displayGrid;

  for (let index = 0; index < mask.cells.length; index++) {
    if (!isKeepMaskSelected(mask.cells[index])) continue;
    displayGrid.cells[index] = previousVisibleGrid.cells[index];
  }

  return displayGrid;
}
