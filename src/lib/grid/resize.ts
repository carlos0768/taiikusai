import { createEmptyGrid, type ColorIndex, type GridData } from "./types";

export interface GridResizeOptions {
  targetWidth: number;
  targetHeight: number;
  autoAdjustIllustration: boolean;
}

interface GridBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPSILON = 1e-9;

function buildBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): GridBounds {
  return { minX, minY, maxX, maxY };
}

function getNonWhiteBounds(grid: GridData): GridBounds | null {
  let minX = grid.width;
  let minY = grid.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.cells[y * grid.width + x] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return buildBounds(minX, minY, maxX, maxY);
}

function getUnionBounds(grids: GridData[]): GridBounds | null {
  let union: GridBounds | null = null;

  for (const grid of grids) {
    const bounds = getNonWhiteBounds(grid);
    if (!bounds) continue;

    if (!union) {
      union = bounds;
      continue;
    }

    union = buildBounds(
      Math.min(union.minX, bounds.minX),
      Math.min(union.minY, bounds.minY),
      Math.max(union.maxX, bounds.maxX),
      Math.max(union.maxY, bounds.maxY)
    );
  }

  return union;
}

function centerPadCropGrid(
  grid: GridData,
  targetWidth: number,
  targetHeight: number
): GridData {
  const resized = createEmptyGrid(targetWidth, targetHeight);
  const copyWidth = Math.min(grid.width, targetWidth);
  const copyHeight = Math.min(grid.height, targetHeight);
  const sourceStartX = Math.max(0, Math.floor((grid.width - targetWidth) / 2));
  const sourceStartY = Math.max(0, Math.floor((grid.height - targetHeight) / 2));
  const targetStartX = Math.max(0, Math.floor((targetWidth - grid.width) / 2));
  const targetStartY = Math.max(0, Math.floor((targetHeight - grid.height) / 2));

  for (let y = 0; y < copyHeight; y++) {
    const sourceOffset = (sourceStartY + y) * grid.width + sourceStartX;
    const targetOffset = (targetStartY + y) * targetWidth + targetStartX;
    resized.cells.set(
      grid.cells.subarray(sourceOffset, sourceOffset + copyWidth),
      targetOffset
    );
  }

  return resized;
}

function chooseDominantColor(weights: Float64Array): ColorIndex {
  let bestColor = 0 as ColorIndex;
  let bestWeight = -1;

  for (let color = 0; color < weights.length; color++) {
    const weight = weights[color];

    if (weight > bestWeight + EPSILON) {
      bestColor = color as ColorIndex;
      bestWeight = weight;
      continue;
    }

    if (Math.abs(weight - bestWeight) > EPSILON) continue;

    const isBestWhite = bestColor === 0;
    const isCandidateNonWhite = color !== 0;
    if (isBestWhite && isCandidateNonWhite && weight > 0) {
      bestColor = color as ColorIndex;
    }
  }

  return bestColor;
}

function resampleGridToTarget(
  grid: GridData,
  bounds: GridBounds,
  targetWidth: number,
  targetHeight: number
): GridData {
  const resized = createEmptyGrid(targetWidth, targetHeight);
  const sourceWidth = bounds.maxX - bounds.minX + 1;
  const sourceHeight = bounds.maxY - bounds.minY + 1;
  const weights = new Float64Array(5);

  for (let targetY = 0; targetY < targetHeight; targetY++) {
    const sourceY0 = (targetY * sourceHeight) / targetHeight;
    const sourceY1 = ((targetY + 1) * sourceHeight) / targetHeight;
    const sourceYStart = Math.max(0, Math.floor(sourceY0));
    const sourceYEnd = Math.min(sourceHeight - 1, Math.ceil(sourceY1) - 1);

    for (let targetX = 0; targetX < targetWidth; targetX++) {
      weights.fill(0);

      const sourceX0 = (targetX * sourceWidth) / targetWidth;
      const sourceX1 = ((targetX + 1) * sourceWidth) / targetWidth;
      const sourceXStart = Math.max(0, Math.floor(sourceX0));
      const sourceXEnd = Math.min(sourceWidth - 1, Math.ceil(sourceX1) - 1);

      for (let sourceY = sourceYStart; sourceY <= sourceYEnd; sourceY++) {
        const overlapY =
          Math.min(sourceY + 1, sourceY1) - Math.max(sourceY, sourceY0);
        if (overlapY <= 0) continue;

        const gridY = bounds.minY + sourceY;
        const rowOffset = gridY * grid.width;

        for (let sourceX = sourceXStart; sourceX <= sourceXEnd; sourceX++) {
          const overlapX =
            Math.min(sourceX + 1, sourceX1) - Math.max(sourceX, sourceX0);
          if (overlapX <= 0) continue;

          const gridX = bounds.minX + sourceX;
          const color = grid.cells[rowOffset + gridX] as ColorIndex;
          weights[color] += overlapX * overlapY;
        }
      }

      resized.cells[targetY * targetWidth + targetX] = chooseDominantColor(
        weights
      );
    }
  }

  return resized;
}

function resizeGridWithBounds(
  grid: GridData,
  targetWidth: number,
  targetHeight: number,
  bounds: GridBounds | null
): GridData {
  if (!bounds) return createEmptyGrid(targetWidth, targetHeight);
  return resampleGridToTarget(grid, bounds, targetWidth, targetHeight);
}

export function resizeGrid(
  grid: GridData,
  options: GridResizeOptions
): GridData {
  const { targetWidth, targetHeight, autoAdjustIllustration } = options;

  if (
    grid.width === targetWidth &&
    grid.height === targetHeight
  ) {
    return {
      width: grid.width,
      height: grid.height,
      cells: new Uint8Array(grid.cells),
    };
  }

  if (!autoAdjustIllustration) {
    return centerPadCropGrid(grid, targetWidth, targetHeight);
  }

  return resizeGridWithBounds(
    grid,
    targetWidth,
    targetHeight,
    getNonWhiteBounds(grid)
  );
}

export function resizeWaveGrids(
  before: GridData,
  after: GridData,
  options: GridResizeOptions
): { before: GridData; after: GridData } {
  const { targetWidth, targetHeight, autoAdjustIllustration } = options;

  if (!autoAdjustIllustration) {
    return {
      before: centerPadCropGrid(before, targetWidth, targetHeight),
      after: centerPadCropGrid(after, targetWidth, targetHeight),
    };
  }

  const unionBounds = getUnionBounds([before, after]);

  return {
    before: resizeGridWithBounds(before, targetWidth, targetHeight, unionBounds),
    after: resizeGridWithBounds(after, targetWidth, targetHeight, unionBounds),
  };
}
