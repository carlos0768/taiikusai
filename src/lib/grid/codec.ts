import type { GridData } from "./types";

export function encodeGrid(grid: GridData): string {
  const bytes = grid.cells;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeGrid(
  base64: string,
  width: number,
  height: number
): GridData {
  const binary = atob(base64);
  const cells = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    cells[i] = binary.charCodeAt(i);
  }
  return { width, height, cells };
}
