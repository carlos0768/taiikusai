import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
} from "@/lib/grid/types";

export interface Viewport {
  scale: number;
  translateX: number;
  translateY: number;
}

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridData,
  canvasWidth: number,
  canvasHeight: number,
  viewport: Viewport,
  selection?: { x1: number; y1: number; x2: number; y2: number } | null,
  moveSelectedCells?: Set<string>,
  moveDragOffset?: { dx: number; dy: number } | null
) {
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Apply viewport transform
  ctx.save();
  ctx.translate(viewport.translateX, viewport.translateY);
  ctx.scale(viewport.scale, viewport.scale);

  // Calculate cell size to fit the canvas
  const cellSize = Math.min(
    (canvasWidth - 40) / grid.width,
    (canvasHeight - 40) / grid.height
  );
  const gridPixelW = cellSize * grid.width;
  const gridPixelH = cellSize * grid.height;
  const offsetX = (canvasWidth / viewport.scale - gridPixelW) / 2;
  const offsetY = (canvasHeight / viewport.scale - gridPixelH) / 2;

  const isDragging = moveSelectedCells && moveSelectedCells.size > 0 && moveDragOffset != null;
  const hasMovePreview =
    isDragging &&
    moveDragOffset !== null &&
    (moveDragOffset.dx !== 0 || moveDragOffset.dy !== 0);

  // Draw cells
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
      ctx.fillStyle = COLOR_MAP[colorIdx];
      ctx.fillRect(
        offsetX + x * cellSize,
        offsetY + y * cellSize,
        cellSize,
        cellSize
      );
    }
  }

  // Draw grid lines
  ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
  ctx.lineWidth = 0.5 / viewport.scale;

  for (let x = 0; x <= grid.width; x++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + x * cellSize, offsetY);
    ctx.lineTo(offsetX + x * cellSize, offsetY + gridPixelH);
    ctx.stroke();
  }

  for (let y = 0; y <= grid.height; y++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + y * cellSize);
    ctx.lineTo(offsetX + gridPixelW, offsetY + y * cellSize);
    ctx.stroke();
  }

  // Draw selection rectangle
  if (selection) {
    const minX = Math.min(selection.x1, selection.x2);
    const maxX = Math.max(selection.x1, selection.x2);
    const minY = Math.min(selection.y1, selection.y2);
    const maxY = Math.max(selection.y1, selection.y2);

    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2 / viewport.scale;
    ctx.setLineDash([4 / viewport.scale, 4 / viewport.scale]);
    ctx.strokeRect(
      offsetX + minX * cellSize,
      offsetY + minY * cellSize,
      (maxX - minX + 1) * cellSize,
      (maxY - minY + 1) * cellSize
    );
    ctx.setLineDash([]);

    // Semi-transparent overlay
    ctx.fillStyle = "rgba(255, 215, 0, 0.1)";
    ctx.fillRect(
      offsetX + minX * cellSize,
      offsetY + minY * cellSize,
      (maxX - minX + 1) * cellSize,
      (maxY - minY + 1) * cellSize
    );
  }

  // Draw free-selection highlights (move tool)
  if (moveSelectedCells && moveSelectedCells.size > 0) {
    if (hasMovePreview && moveDragOffset) {
      // Dragging after movement: keep source colors visible and draw the destination preview.
      for (const key of moveSelectedCells) {
        const [cx, cy] = key.split(",").map(Number);
        const nx = cx + moveDragOffset.dx;
        const ny = cy + moveDragOffset.dy;
        if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
          const colorIdx = grid.cells[cy * grid.width + cx] as ColorIndex;
          ctx.fillStyle = COLOR_MAP[colorIdx];
          ctx.fillRect(
            offsetX + nx * cellSize,
            offsetY + ny * cellSize,
            cellSize,
            cellSize
          );
        }
      }

      // Outline around destination cells
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 1.5 / viewport.scale;
      for (const key of moveSelectedCells) {
        const [cx, cy] = key.split(",").map(Number);
        const nx = cx + moveDragOffset.dx;
        const ny = cy + moveDragOffset.dy;
        if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
          ctx.strokeRect(
            offsetX + nx * cellSize,
            offsetY + ny * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    } else {
      // Not dragging, or holding before movement: just highlight selected cells.
      ctx.fillStyle = "rgba(255, 215, 0, 0.25)";
      for (const key of moveSelectedCells) {
        const [cx, cy] = key.split(",").map(Number);
        if (cx >= 0 && cx < grid.width && cy >= 0 && cy < grid.height) {
          ctx.fillRect(
            offsetX + cx * cellSize,
            offsetY + cy * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  }

  // Draw border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1 / viewport.scale;
  ctx.strokeRect(offsetX, offsetY, gridPixelW, gridPixelH);

  ctx.restore();
}

/** Convert screen coordinates to grid cell coordinates */
export function screenToGrid(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridData,
  viewport: Viewport
): { x: number; y: number } | null {
  const cellSize = Math.min(
    (canvasWidth - 40) / grid.width,
    (canvasHeight - 40) / grid.height
  );
  const gridPixelW = cellSize * grid.width;
  const gridPixelH = cellSize * grid.height;
  const offsetX = (canvasWidth / viewport.scale - gridPixelW) / 2;
  const offsetY = (canvasHeight / viewport.scale - gridPixelH) / 2;

  // Reverse viewport transform
  const worldX = (screenX - viewport.translateX) / viewport.scale;
  const worldY = (screenY - viewport.translateY) / viewport.scale;

  const gridX = Math.floor((worldX - offsetX) / cellSize);
  const gridY = Math.floor((worldY - offsetY) / cellSize);

  if (gridX < 0 || gridX >= grid.width || gridY < 0 || gridY >= grid.height) {
    return null;
  }

  return { x: gridX, y: gridY };
}
