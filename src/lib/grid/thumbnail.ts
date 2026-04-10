import { COLOR_MAP, type ColorIndex, type GridData } from "./types";

export function generateThumbnailDataUrl(
  grid: GridData,
  maxWidth: number = 200,
  maxHeight: number = 120
): string {
  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = maxHeight;
  const ctx = canvas.getContext("2d")!;

  const cellW = maxWidth / grid.width;
  const cellH = maxHeight / grid.height;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
      ctx.fillStyle = COLOR_MAP[colorIdx];
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }

  return canvas.toDataURL("image/png");
}
