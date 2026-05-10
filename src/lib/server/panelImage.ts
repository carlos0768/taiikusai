import sharp from "sharp";
import { encodeGrid } from "@/lib/grid/codec";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";

type PaintColorIndex = 0 | 1 | 2 | 3 | 4;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface PaletteEntry extends Rgb {
  index: PaintColorIndex;
}

const PANEL_PALETTE: PaletteEntry[] = [
  { index: 0, r: 255, g: 255, b: 255 },
  { index: 1, r: 255, g: 215, b: 0 },
  { index: 2, r: 255, g: 0, b: 0 },
  { index: 3, r: 0, g: 0, b: 0 },
  { index: 4, r: 0, g: 0, b: 255 },
];

function parseHexColor(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channelSpread({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function weightedDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

export function quantizeRgbToPanelColor(rgb: Rgb): PaintColorIndex {
  const luma = luminance(rgb);

  if (luma >= 242 && channelSpread(rgb) <= 34) {
    return 0;
  }

  if (luma <= 62) {
    return 3;
  }

  let nearest = PANEL_PALETTE[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of PANEL_PALETTE) {
    const distance = weightedDistance(rgb, color);
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }

  return nearest.index;
}

export async function createPanelPaletteDataUrl(): Promise<string> {
  const colors = [0, 1, 2, 3, 4].map((index) =>
    parseHexColor(COLOR_MAP[index as ColorIndex])
  );
  const swatchSize = 16;
  const width = colors.length * swatchSize;
  const height = swatchSize;
  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = colors[Math.floor(x / swatchSize)];
      const offset = (y * width + x) * 3;
      pixels[offset] = color.r;
      pixels[offset + 1] = color.g;
      pixels[offset + 2] = color.b;
    }
  }

  const png = await sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function imageBufferToPanelGrid(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<GridData> {
  const { data } = await sharp(imageBuffer)
    .rotate()
    .ensureAlpha()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: "mitchell",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cells = new Uint8Array(width * height);

  for (let cell = 0; cell < cells.length; cell += 1) {
    const offset = cell * 4;
    const alpha = data[offset + 3] / 255;

    if (alpha <= 0.06) {
      cells[cell] = 0;
      continue;
    }

    const rgb = {
      r: Math.round(data[offset] * alpha + 255 * (1 - alpha)),
      g: Math.round(data[offset + 1] * alpha + 255 * (1 - alpha)),
      b: Math.round(data[offset + 2] * alpha + 255 * (1 - alpha)),
    };

    cells[cell] = quantizeRgbToPanelColor(rgb);
  }

  return { width, height, cells };
}

export function encodePanelGrid(grid: GridData): string {
  return encodeGrid(grid);
}
