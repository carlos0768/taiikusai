import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
} from "@/lib/grid/types";
import type { PanelDsl, PanelDslElement } from "./types";

const RENDER_SCALE = 12;

const PALETTE_RGB: Record<ColorIndex, [number, number, number]> = {
  0: [255, 255, 255],
  1: [255, 215, 0],
  2: [255, 0, 0],
  3: [0, 0, 0],
  4: [0, 0, 255],
};

function nearestColorIndex(r: number, g: number, b: number): ColorIndex {
  let best: ColorIndex = 0;
  let bestDistance = Infinity;

  for (const [key, [cr, cg, cb]] of Object.entries(PALETTE_RGB)) {
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(key) as ColorIndex;
    }
  }

  return best;
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: PanelDslElement,
  warnings: string[]
) {
  const [a, b, c, d] = element.box;
  ctx.fillStyle = COLOR_MAP[element.color];
  ctx.strokeStyle = COLOR_MAP[element.color];
  ctx.lineWidth = Math.max(1, element.strokeWidth * RENDER_SCALE);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (element.kind === "rect") {
    if (c <= 0 || d <= 0) {
      warnings.push("幅または高さが0以下の矩形をスキップしました");
      return;
    }
    ctx.fillRect(a * RENDER_SCALE, b * RENDER_SCALE, c * RENDER_SCALE, d * RENDER_SCALE);
    return;
  }

  if (element.kind === "ellipse") {
    if (c <= 0 || d <= 0) {
      warnings.push("半径が0以下の楕円をスキップしました");
      return;
    }
    ctx.beginPath();
    ctx.ellipse(
      a * RENDER_SCALE,
      b * RENDER_SCALE,
      c * RENDER_SCALE,
      d * RENDER_SCALE,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    return;
  }

  if (element.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(a * RENDER_SCALE, b * RENDER_SCALE);
    ctx.lineTo(c * RENDER_SCALE, d * RENDER_SCALE);
    ctx.stroke();
    return;
  }

  if (element.kind === "polygon") {
    if (element.points.length < 3) {
      warnings.push("頂点が3点未満の多角形をスキップしました");
      return;
    }
    ctx.beginPath();
    ctx.moveTo(element.points[0][0] * RENDER_SCALE, element.points[0][1] * RENDER_SCALE);
    for (const [x, y] of element.points.slice(1)) {
      ctx.lineTo(x * RENDER_SCALE, y * RENDER_SCALE);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (!element.text.trim()) {
    warnings.push("空文字のテキスト要素をスキップしました");
    return;
  }

  const fontSize = Math.max(1, c) * RENDER_SCALE;
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(element.text, a * RENDER_SCALE, b * RENDER_SCALE);
}

export function renderPanelDslToGrid(
  dsl: PanelDsl,
  width: number,
  height: number
): { grid: GridData; warnings: string[] } {
  const warnings: string[] = [];
  const canvas = document.createElement("canvas");
  const canvasWidth = width * RENDER_SCALE;
  const canvasHeight = height * RENDER_SCALE;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      grid: {
        width,
        height,
        cells: new Uint8Array(width * height),
      },
      warnings: ["Canvasを初期化できませんでした"],
    };
  }

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COLOR_MAP[dsl.background];
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (const element of dsl.elements) {
    drawElement(ctx, element, warnings);
  }

  const image = ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
  const cells = new Uint8Array(width * height);

  for (let gridY = 0; gridY < height; gridY += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const counts = [0, 0, 0, 0, 0];

      for (let py = 0; py < RENDER_SCALE; py += 1) {
        for (let px = 0; px < RENDER_SCALE; px += 1) {
          const sourceX = gridX * RENDER_SCALE + px;
          const sourceY = gridY * RENDER_SCALE + py;
          const index = (sourceY * canvasWidth + sourceX) * 4;
          const colorIndex = nearestColorIndex(
            image[index],
            image[index + 1],
            image[index + 2]
          );
          counts[colorIndex] += 1;
        }
      }

      let bestColor = dsl.background;
      let bestCount = -1;
      counts.forEach((count, colorIndex) => {
        if (count > bestCount) {
          bestColor = colorIndex as ColorIndex;
          bestCount = count;
        }
      });

      cells[gridY * width + gridX] = bestColor;
    }
  }

  return {
    grid: { width, height, cells },
    warnings,
  };
}
