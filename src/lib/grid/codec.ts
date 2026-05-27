import type { GridData } from "./types";

function encodeBytes(bytes: Uint8Array): string {
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBytes(base64: string): Uint8Array {
  if (typeof globalThis.Buffer !== "undefined") {
    return new Uint8Array(globalThis.Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const cells = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    cells[i] = binary.charCodeAt(i);
  }
  return cells;
}

function normalizeCellsLength(
  cells: Uint8Array,
  expectedLength: number
): Uint8Array {
  if (cells.length === expectedLength) return cells;

  const normalized = new Uint8Array(expectedLength);
  normalized.set(cells.subarray(0, expectedLength));
  return normalized;
}

export function encodeGrid(grid: GridData): string {
  return encodeBytes(grid.cells);
}

export function decodeGrid(
  base64: string,
  width: number,
  height: number
): GridData {
  const expectedLength = width * height;
  const cells = normalizeCellsLength(decodeBytes(base64), expectedLength);
  return { width, height, cells };
}
