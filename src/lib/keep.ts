import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid, type GridData } from "@/lib/grid/types";

export function normalizeKeepMaskGrid(mask: GridData): GridData {
  const cells = new Uint8Array(mask.width * mask.height);
  const maxLength = Math.min(cells.length, mask.cells.length);
  for (let index = 0; index < maxLength; index += 1) {
    cells[index] = mask.cells[index] === 1 ? 1 : 0;
  }
  return { width: mask.width, height: mask.height, cells };
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

export function buildDefaultKeepMask(sourceGrid: GridData, targetGrid: GridData): GridData {
  const width = sourceGrid.width;
  const height = sourceGrid.height;
  const cells = new Uint8Array(width * height);
  const maxLength = Math.min(cells.length, sourceGrid.cells.length, targetGrid.cells.length);

  for (let index = 0; index < maxLength; index += 1) {
    cells[index] = sourceGrid.cells[index] === targetGrid.cells[index] ? 1 : 0;
  }

  return { width, height, cells };
}

export function filterKeepMaskBySameColor(
  sourceGrid: GridData,
  targetGrid: GridData,
  mask: GridData
): GridData {
  const normalizedMask = normalizeKeepMaskGrid(mask);
  const cells = new Uint8Array(sourceGrid.width * sourceGrid.height);
  const maxLength = Math.min(
    cells.length,
    normalizedMask.cells.length,
    sourceGrid.cells.length,
    targetGrid.cells.length
  );

  for (let index = 0; index < maxLength; index += 1) {
    cells[index] =
      normalizedMask.cells[index] === 1 &&
      sourceGrid.cells[index] === targetGrid.cells[index]
        ? 1
        : 0;
  }

  return { width: sourceGrid.width, height: sourceGrid.height, cells };
}

export function applyKeepTransition(sourceGrid: GridData, mask: GridData): GridData {
  const transitionGrid = createEmptyGrid(sourceGrid.width, sourceGrid.height);
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
