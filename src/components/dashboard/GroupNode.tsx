"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";
import { decodeGrid } from "@/lib/grid/codec";

export interface GroupNodeData {
  name: string;
  nodeCount: number;
  gridData: string;
  gridWidth: number;
  gridHeight: number;
  hasOutgoingEdge: boolean;
  onExpand: (groupId: string) => void;
  [key: string]: unknown;
}

function GroupNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as unknown as GroupNodeData;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const didMoveRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodeData.gridData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = decodeGrid(nodeData.gridData, nodeData.gridWidth, nodeData.gridHeight);
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX > rect.width - 15) return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    didMoveRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      didMoveRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressStartRef.current && !didMoveRef.current) {
      nodeData.onExpand(id);
    }
    longPressStartRef.current = null;
  }, [id, nodeData]);

  const stackCount = Math.min(nodeData.nodeCount - 1, 2);

  return (
    <div
      className="select-none"
      style={{ position: "relative", width: 176 + stackCount * 4 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { longPressStartRef.current = null; }}
    >
      {/* Stacked card shadows (back layers) */}
      {nodeData.nodeCount >= 3 && (
        <div
          className="absolute bg-card border border-card-border rounded-lg"
          style={{ top: 8, left: 8, width: 176, bottom: -8, zIndex: 0 }}
        />
      )}
      {nodeData.nodeCount >= 2 && (
        <div
          className="absolute bg-card border border-card-border rounded-lg"
          style={{ top: 4, left: 4, width: 176, bottom: -4, zIndex: 1 }}
        />
      )}

      {/* Main card */}
      <div
        className="relative bg-card border-2 border-accent/70 rounded-lg shadow-lg overflow-visible"
        style={{ width: 176, cursor: "grab", zIndex: 2 }}
      >
        {/* Thumbnail area */}
        <div className="p-2 bg-background/50 rounded-t-lg relative">
          <canvas
            ref={canvasRef}
            className="w-full rounded opacity-60"
            style={{ imageRendering: "pixelated" }}
          />
          {/* Count badge */}
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-accent text-black text-[10px] font-bold rounded-full leading-tight">
            ×{nodeData.nodeCount}
          </div>
          {/* Fold indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-foreground/70 text-[11px] font-medium bg-card/80 px-2 py-0.5 rounded">
              タップして展開
            </span>
          </div>
        </div>

        {/* Name row */}
        <div className="px-2 py-1.5 text-xs text-foreground flex items-center gap-1 min-w-0">
          <span className="text-accent shrink-0">▤</span>
          <span className="truncate">{nodeData.name}</span>
          <span className="shrink-0 text-[10px] text-muted ml-auto">
            {nodeData.nodeCount}枚
          </span>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-accent !border-2 !border-card"
        />
        <Handle
          type="source"
          position={Position.Right}
          className={`!w-3 !h-3 !rounded-full !border-0 ${
            nodeData.hasOutgoingEdge ? "!bg-accent/40" : "!bg-accent"
          }`}
        />
      </div>
    </div>
  );
}

export default memo(GroupNodeComponent);
