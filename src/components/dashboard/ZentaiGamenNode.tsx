"use client";

import { memo, useCallback, useEffect, useRef } from "react";
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
  onLongPress: (id: string, name: string, x: number, y: number) => void;
  [key: string]: unknown;
}

function ZentaiGamenNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as unknown as ZentaiGamenNodeData;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

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
    const thumbH = Math.round(
      (nodeData.gridHeight / nodeData.gridWidth) * thumbW
    );
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        nodeData.onLongPress(id, nodeData.name, e.clientX, e.clientY);
        longPressTimerRef.current = null;
      }, 600);
    },
    [id, nodeData]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (longPressStartRef.current) {
      const dx = e.clientX - longPressStartRef.current.x;
      const dy = e.clientY - longPressStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  return (
    <div
      className="bg-card border border-card-border rounded-lg shadow-lg overflow-visible select-none relative"
      style={{ width: 176, cursor: "grab" }}
      onDoubleClick={() => nodeData.onDoubleClick(id)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Thumbnail */}
      <div className="p-2 bg-background/50 rounded-t-lg">
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

      {/* Target handle — small circle on left side */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-card"
      />

      {/* Source handle — top-right corner, styled as arrow circle */}
      <Handle
        type="source"
        position={Position.Top}
        className={`!w-4 !h-4 !rounded-full !border-2 ${
          nodeData.hasOutgoingEdge
            ? "!bg-accent/30 !border-accent/30"
            : "!bg-accent !border-accent"
        }`}
        style={{ top: -8, left: "auto", right: -8 }}
      />
    </div>
  );
}

export default memo(ZentaiGamenNodeComponent);
