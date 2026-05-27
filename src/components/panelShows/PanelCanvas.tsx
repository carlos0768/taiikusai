"use client";

import { useEffect, useRef } from "react";
import { decodeGrid } from "@/lib/grid/codec";
import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";

interface PanelCanvasProps {
  gridData: string;
  gridWidth: number;
  gridHeight: number;
  className?: string;
}

export default function PanelCanvas({
  gridData,
  gridWidth,
  gridHeight,
  className,
}: PanelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = decodeGrid(gridData, gridWidth, gridHeight);
    const w = 200;
    const h = Math.max(1, Math.round((gridHeight / gridWidth) * w));
    canvas.width = w;
    canvas.height = h;
    const cellW = w / grid.width;
    const cellH = h / grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const idx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[idx];
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [gridData, gridWidth, gridHeight]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", display: "block", width: "100%" }}
    />
  );
}
