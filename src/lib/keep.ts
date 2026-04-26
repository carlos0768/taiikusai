import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import {
  UNDEFINED_COLOR,
  createFilledGrid,
  type GridData,
} from "@/lib/grid/types";

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

export function decodeKeepMask(
  encodedMask: string | null | undefined,
  width: number,
  height: number
): GridData | null {
  if (!encodedMask) return null;

  try {
    return normalizeKeepMaskGrid(decodeGrid(encodedMask, width, height));
  } catch {
    return null;
  }
}

export function encodeKeepMask(mask: GridData): string {
  return encodeGrid(normalizeKeepMaskGrid(mask));
}

export function isKeepEligibleSameColorCell(
  sourceColor: number,
  targetColor: number
): boolean {
  return (
    sourceColor === targetColor &&
    sourceColor !== 0 &&
    sourceColor !== UNDEFINED_COLOR
  );
}

export function buildDefaultKeepMask(sourceGrid: GridData, targetGrid: GridData): GridData {
  const mask = createKeepMaskGrid(sourceGrid.width, sourceGrid.height);
  const maxLength = Math.min(
    mask.cells.length,
    sourceGrid.cells.length,
    targetGrid.cells.length
  );

  for (let index = 0; index < maxLength; index += 1) {
    mask.cells[index] = isKeepEligibleSameColorCell(
      sourceGrid.cells[index],
      targetGrid.cells[index]
    )
      ? 1
      : 0;
  }

  return mask;
}

export function filterKeepMaskBySameColor(
  sourceGrid: GridData,
  targetGrid: GridData,
  mask: GridData
): GridData {
  const normalizedMask = normalizeKeepMaskGrid(mask);
  const filtered = createKeepMaskGrid(sourceGrid.width, sourceGrid.height);
  const maxLength = Math.min(
    filtered.cells.length,
    normalizedMask.cells.length,
    sourceGrid.cells.length,
    targetGrid.cells.length
  );

  for (let index = 0; index < maxLength; index += 1) {
    filtered.cells[index] =
      normalizedMask.cells[index] === 1 &&
      isKeepEligibleSameColorCell(sourceGrid.cells[index], targetGrid.cells[index])
        ? 1
        : 0;
  }

  return filtered;
}

export function applyKeepTransition(sourceGrid: GridData, mask: GridData): GridData {
  const transitionGrid = createFilledGrid(sourceGrid.width, sourceGrid.height, 0);
  const normalizedMask = normalizeKeepMaskGrid(mask);
  const maxLength = Math.min(
    transitionGrid.cells.length,
    sourceGrid.cells.length,
    normalizedMask.cells.length
  );

  for (let index = 0; index < maxLength; index += 1) {
    if (normalizedMask.cells[index] === 1) {
      transitionGrid.cells[index] = sourceGrid.cells[index];
    }
  }

  return transitionGrid;
}

export function isKeepCell(mask: GridData | null, index: number): boolean {
  return mask?.cells[index] === 1;
}

export function hasKeepCells(mask: GridData | null): boolean {
  if (!mask) return false;
  for (let index = 0; index < mask.cells.length; index += 1) {
    if (mask.cells[index] === 1) return true;
  }
  return false;
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
