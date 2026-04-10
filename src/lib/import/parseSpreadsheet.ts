import * as XLSX from "xlsx";
import type { ColorIndex } from "@/lib/grid/types";

const COLOR_RGB: Record<ColorIndex, [number, number, number]> = {
  0: [255, 255, 255], // white
  1: [255, 215, 0], // yellow
  2: [255, 0, 0], // red
  3: [0, 0, 0], // black
  4: [0, 0, 255], // blue
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function nearestColor(r: number, g: number, b: number): ColorIndex {
  let best: ColorIndex = 0;
  let bestDist = Infinity;
  for (const [idx, [cr, cg, cb]] of Object.entries(COLOR_RGB)) {
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = Number(idx) as ColorIndex;
    }
  }
  return best;
}

export interface ParseResult {
  cells: Uint8Array;
  width: number;
  height: number;
  warnings: string[];
}

export function parseExcel(
  buffer: ArrayBuffer,
  targetWidth: number,
  targetHeight: number
): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const warnings: string[] = [];
  const cells = new Uint8Array(targetWidth * targetHeight);

  if (!sheet) {
    warnings.push("シートが見つかりません");
    return { cells, width: targetWidth, height: targetHeight, warnings };
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const row = range.s.r + y;
      const col = range.s.c + x;
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[addr];

      if (!cell) continue;

      // Try cell background color
      const fill = cell.s?.fgColor ?? cell.s?.bgColor;
      if (fill?.rgb) {
        const [r, g, b] = hexToRgb(fill.rgb);
        cells[y * targetWidth + x] = nearestColor(r, g, b);
        continue;
      }

      // Try cell value as color index
      const val = cell.v;
      if (typeof val === "number" && val >= 0 && val <= 4) {
        cells[y * targetWidth + x] = val as ColorIndex;
        continue;
      }

      // Try color name
      if (typeof val === "string") {
        const colorMap: Record<string, ColorIndex> = {
          白: 0, white: 0, "0": 0,
          黄: 1, yellow: 1, "1": 1,
          赤: 2, red: 2, "2": 2,
          黒: 3, black: 3, "3": 3,
          青: 4, blue: 4, "4": 4,
        };
        const mapped = colorMap[val.trim().toLowerCase()];
        if (mapped !== undefined) {
          cells[y * targetWidth + x] = mapped;
        }
      }
    }
  }

  return { cells, width: targetWidth, height: targetHeight, warnings };
}

export function parseCsv(
  text: string,
  targetWidth: number,
  targetHeight: number
): ParseResult {
  const warnings: string[] = [];
  const cells = new Uint8Array(targetWidth * targetHeight);
  const lines = text.trim().split("\n");

  for (let y = 0; y < Math.min(lines.length, targetHeight); y++) {
    const cols = lines[y].split(",");
    for (let x = 0; x < Math.min(cols.length, targetWidth); x++) {
      const val = cols[x].trim();
      const colorMap: Record<string, ColorIndex> = {
        "0": 0, 白: 0, white: 0,
        "1": 1, 黄: 1, yellow: 1,
        "2": 2, 赤: 2, red: 2,
        "3": 3, 黒: 3, black: 3,
        "4": 4, 青: 4, blue: 4,
      };
      const mapped = colorMap[val.toLowerCase()];
      if (mapped !== undefined) {
        cells[y * targetWidth + x] = mapped;
      }
    }
  }

  return { cells, width: targetWidth, height: targetHeight, warnings };
}
