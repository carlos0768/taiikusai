"use client";

import { memo, useCallback, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

interface ConnectionEdgeData {
  canEdit?: boolean;
  hasKeep?: boolean;
  isKeepRangeSelected?: boolean;
  keepCount?: number;
  onClick?: (edgeId: string) => void;
  onLongPress?: (edgeId: string, x: number, y: number) => void;
  onOpenKeepEditor?: (edgeId: string) => void;
  [key: string]: unknown;
}

function ConnectionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = data as ConnectionEdgeData | undefined;
  const hasKeep = edgeData?.hasKeep === true;
  const keepCount = edgeData?.keepCount ?? 0;
  const isKeepRangeSelected = edgeData?.isKeepRangeSelected === true;
  const canEdit = edgeData?.canEdit === true;
  const [hovered, setHovered] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const stroke = isKeepRangeSelected ? "#FFD700" : hasKeep ? "#00E5FF" : "#FFD700";
  const strokeWidth = isKeepRangeSelected ? 6 : hasKeep ? 5 : 3;

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGPathElement>) => {
      event.stopPropagation();
      longPressStartRef.current = { x: event.clientX, y: event.clientY };
      longPressTriggeredRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        edgeData?.onLongPress?.(id, event.clientX, event.clientY);
        longPressTimerRef.current = null;
      }, 600);
    },
    [edgeData, id]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGPathElement>) => {
      if (!longPressStartRef.current) return;

      const dx = event.clientX - longPressStartRef.current.x;
      const dy = event.clientY - longPressStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        cancelLongPress();
      }
    },
    [cancelLongPress]
  );

  const handlePointerUp = useCallback(() => {
    cancelLongPress();
    longPressStartRef.current = null;
  }, [cancelLongPress]);

  const handleClick = useCallback(
    (event: React.MouseEvent<SVGPathElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }

      edgeData?.onClick?.(id);
    },
    [edgeData, id]
  );

  return (
    <>
      {isKeepRangeSelected && (
        <BaseEdge
          id={`${id}-range-glow`}
          path={edgePath}
          style={{
            stroke: "rgba(255, 215, 0, 0.26)",
            strokeWidth: 14,
          }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          cursor: "pointer",
          strokeDasharray: hasKeep ? "10 7" : undefined,
          animation: hasKeep ? "keep-edge-flow 850ms linear infinite" : undefined,
          filter: isKeepRangeSelected
            ? "drop-shadow(0 0 8px rgba(255, 215, 0, 0.75))"
            : hasKeep
              ? "drop-shadow(0 0 5px rgba(0, 229, 255, 0.45))"
              : undefined,
          ...style,
        }}
        markerEnd={markerEnd}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
          style={{ left: labelX, top: labelY, pointerEvents: "all" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hasKeep && (
            <span className="rounded-full border border-cyan-200/70 bg-background/95 px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-200 shadow-lg">
              keep
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                edgeData?.onOpenKeepEditor?.(id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-200/70 bg-card/95 text-base font-semibold leading-none text-cyan-100 shadow-lg transition-colors hover:bg-cyan-300 hover:text-black"
              aria-label={hasKeep ? "keep表示を編集" : "keep表示を追加"}
              title={hasKeep ? "keep表示を編集" : "keep表示を追加"}
            >
              +
            </button>
          )}
          {hovered && (
            <span className="pointer-events-none absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded-md border border-card-border bg-card/95 px-2 py-1 text-[11px] text-foreground shadow-lg">
              {hasKeep ? `keep ON: ${keepCount}セル` : "keepなし"}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(ConnectionEdgeComponent);
