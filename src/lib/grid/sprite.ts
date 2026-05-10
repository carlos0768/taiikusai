import {
  NUM_COLORS,
  createEmptyGrid,
  setCell,
  type ColorIndex,
  type GridData,
} from "./types";

export interface PanelSprite {
  width: number;
  height: number;
  palette: Record<string, ColorIndex>;
  rows: string[];
}

function isColorIndex(value: unknown): value is ColorIndex {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < NUM_COLORS
  );
}

function normalizePalette(palette: unknown): Record<string, ColorIndex> {
  if (!palette || typeof palette !== "object" || Array.isArray(palette)) {
    throw new Error("sprite.palette must be an object");
  }

  const result: Record<string, ColorIndex> = {
    ".": 0,
    " ": 0,
  };

  for (const [key, rawValue] of Object.entries(palette)) {
    const symbol = Array.from(key)[0];
    const value =
      typeof rawValue === "string" && rawValue.trim() !== ""
        ? Number(rawValue)
        : rawValue;

    if (!symbol || !isColorIndex(value)) {
      throw new Error("sprite.palette contains an invalid color index");
    }

    result[symbol] = value;
  }

  return result;
}

export function normalizeSprite(input: unknown): PanelSprite {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("sprite must be an object");
  }

  const sprite = input as {
    width?: unknown;
    height?: unknown;
    palette?: unknown;
    rows?: unknown;
  };

  if (
    typeof sprite.width !== "number" ||
    !Number.isInteger(sprite.width) ||
    sprite.width <= 0
  ) {
    throw new Error("sprite.width must be a positive integer");
  }

  if (
    typeof sprite.height !== "number" ||
    !Number.isInteger(sprite.height) ||
    sprite.height <= 0
  ) {
    throw new Error("sprite.height must be a positive integer");
  }

  if (!Array.isArray(sprite.rows)) {
    throw new Error("sprite.rows must be an array");
  }

  const rows = sprite.rows.map((row) => {
    if (typeof row !== "string") {
      throw new Error("sprite.rows must contain strings");
    }
    return row;
  });

  if (rows.length !== sprite.height) {
    throw new Error("sprite.rows length must match sprite.height");
  }

  const palette = normalizePalette(sprite.palette);

  for (const row of rows) {
    if (Array.from(row).length !== sprite.width) {
      throw new Error("each sprite row must match sprite.width");
    }

    for (const symbol of Array.from(row)) {
      if (palette[symbol] === undefined) {
        throw new Error(`sprite row contains unknown palette symbol: ${symbol}`);
      }
    }
  }

  return {
    width: sprite.width,
    height: sprite.height,
    palette,
    rows,
  };
}

export function renderSpriteToGrid(
  sprite: PanelSprite,
  targetWidth: number,
  targetHeight: number
): GridData {
  if (sprite.width > targetWidth || sprite.height > targetHeight) {
    throw new Error("sprite is larger than target grid");
  }

  const grid = createEmptyGrid(targetWidth, targetHeight);
  const originX = Math.floor((targetWidth - sprite.width) / 2);
  const originY = Math.floor((targetHeight - sprite.height) / 2);

  for (let y = 0; y < sprite.height; y += 1) {
    const symbols = Array.from(sprite.rows[y]);

    for (let x = 0; x < sprite.width; x += 1) {
      setCell(grid, originX + x, originY + y, sprite.palette[symbols[x]]);
    }
  }

  return grid;
}
