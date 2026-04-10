"use client";

import { memo, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";
import { decodeGrid } from "@/lib/grid/codec";

export interface ZentaiGamenNodeData {
  name: string;
  gridData: string;
  gridWidth: number;
  gridHeight: number;
  hasOutgoingEdge: boolean;
  onDoubleClick: (id: string) => void;
  [key: string]: unknown;
}

function ZentaiGamenNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as unknown as ZentaiGamenNodeData;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodeData.gridData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = decodeGrid(
      nodeData.gridData,
      nodeData.gridWidth,
      nodeData.gridHeight
    );
    const thumbW = 160;
    const thumbH = Math.round((nodeData.gridHeight / nodeData.gridWidth) * thumbW);
    canvas.width = thumbW;
    canvas.height = thumbH;

    const cellW = thumbW / grid.width;
    const cellH = thumbH / grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[colorIdx];
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [nodeData.gridData, nodeData.gridWidth, nodeData.gridHeight]);

  return (
    <div
      className="bg-card border border-card-border rounded-lg shadow-lg overflow-hidden cursor-pointer select-none"
      style={{ width: 176 }}
      onDoubleClick={() => nodeData.onDoubleClick(id)}
    >
      {/* Thumbnail */}
      <div className="p-2 bg-background/50">
        <canvas
          ref={canvasRef}
          className="w-full rounded"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Name */}
      <div className="px-2 py-1.5 text-xs text-foreground truncate">
        {nodeData.name}
      </div>

      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-card"
      />

      {/* Source handle (top-right arrow) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !border-0 !rounded-none !bg-transparent"
        style={{ top: 8, right: -2 }}
      >
        <div
          className={`w-4 h-4 flex items-center justify-center text-xs pointer-events-none ${
            nodeData.hasOutgoingEdge ? "text-accent/40" : "text-accent"
          }`}
        >
          ↗
        </div>
      </Handle>
    </div>
  );
}

export default memo(ZentaiGamenNodeComponent);
