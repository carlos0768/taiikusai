import sharp from "sharp";
import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";

const RGB_BY_COLOR = Object.fromEntries(
  Object.entries(COLOR_MAP).map(([index, hex]) => [
    Number(index),
    [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ],
  ])
) as Record<ColorIndex, [number, number, number]>;

export async function renderToPng(
  cells: Uint8Array,
  width: number,
  height: number
): Promise<Buffer> {
  if (width <= 0 || height <= 0 || cells.length !== width * height) {
    throw new Error("cells size must match width * height");
  }

  const cellPx = Math.max(2, Math.floor(512 / Math.max(width, height)));
  const outputWidth = width * cellPx;
  const outputHeight = height * cellPx;
  const rgb = Buffer.alloc(outputWidth * outputHeight * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color =
        RGB_BY_COLOR[cells[y * width + x] as ColorIndex] ?? RGB_BY_COLOR[0];

      for (let yy = 0; yy < cellPx; yy += 1) {
        const rowOffset = ((y * cellPx + yy) * outputWidth + x * cellPx) * 3;

        for (let xx = 0; xx < cellPx; xx += 1) {
          const offset = rowOffset + xx * 3;
          rgb[offset] = color[0];
          rgb[offset + 1] = color[1];
          rgb[offset + 2] = color[2];
        }
      }
    }
  }

  return sharp(rgb, {
    raw: {
      width: outputWidth,
      height: outputHeight,
      channels: 3,
    },
  })
    .png()
    .toBuffer();
}
