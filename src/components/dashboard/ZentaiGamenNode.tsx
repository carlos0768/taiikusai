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
  isWave: boolean;
  isKeepRangeSelected?: boolean;
  isKeepRangeStart?: boolean;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onDoubleClick: (id: string) => void;
  onLongPress: (id: string, name: string, x: number, y: number) => void;
  onSelect?: (id: string) => void;
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

  const didMoveRef = useRef(false);
  const longPressTriggeredRef = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't start long press if touching the source handle area (right edge)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      if (localX > rect.width - 15) {
        return;
      }

      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      didMoveRef.current = false;
      longPressTriggeredRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        nodeData.onLongPress(id, nodeData.name, e.clientX, e.clientY);
        longPressTimerRef.current = null;
      }, 600);
    },
    [id, nodeData]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (longPressStartRef.current) {
        const dx = e.clientX - longPressStartRef.current.x;
        const dy = e.clientY - longPressStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          didMoveRef.current = true;
          cancelLongPress();
        }
      }
    },
    [cancelLongPress]
  );

  const handlePointerUp = useCallback(() => {
    cancelLongPress();
    if (
      longPressStartRef.current &&
      !didMoveRef.current &&
      !longPressTriggeredRef.current
    ) {
      if (nodeData.isMultiSelectMode && nodeData.onSelect) {
        nodeData.onSelect(id);
      } else {
        nodeData.onDoubleClick(id);
      }
    }
    longPressStartRef.current = null;
  }, [cancelLongPress, nodeData, id]);

  const borderClass = nodeData.isSelected
    ? "border-2 border-accent shadow-lg shadow-accent/40"
    : nodeData.isKeepRangeSelected
    ? "border-2 border-accent shadow-accent/30"
    : "border border-card-border";

  return (
    <div
      className={`bg-card rounded-lg shadow-lg overflow-visible select-none relative transition-colors ${borderClass}`}
      style={{ width: 176, cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { cancelLongPress(); longPressStartRef.current = null; }}
    >
      {/* Thumbnail */}
      <div className="p-2 bg-background/50 rounded-t-lg relative">
        <canvas
          ref={canvasRef}
          className="w-full rounded"
          style={{ imageRendering: "pixelated" }}
        />
        {nodeData.isWave && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-bold bg-accent text-black rounded">
            〜 WAVE
          </span>
        )}
        {nodeData.isSelected && (
          <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
            <span className="text-black text-[11px] font-bold leading-none">✓</span>
          </div>
        )}
        {nodeData.isMultiSelectMode && !nodeData.isSelected && (
          <div className="absolute top-1 right-1 w-5 h-5 bg-card/80 border border-card-border rounded-full" />
        )}
      </div>

      {/* Name */}
      <div className="px-2 py-1.5 text-xs text-foreground truncate">
        {nodeData.isKeepRangeStart && (
          <span className="mr-1 rounded bg-accent px-1 py-0.5 text-[10px] font-semibold text-black">
            start
          </span>
        )}
        {nodeData.name}
      </div>

      {/* Target handle — small circle on left side */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-card"
      />

      {/* Source handle — small yellow circle on right side center */}
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-3 !h-3 !rounded-full !border-0 ${
          nodeData.hasOutgoingEdge ? "!bg-accent/40" : "!bg-accent"
        }`}
      />
    </div>
  );
}

export default memo(ZentaiGamenNodeComponent);
