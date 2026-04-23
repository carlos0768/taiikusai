"use client";

import { memo, useCallback, useRef } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

interface ConnectionEdgeData {
  onClick?: (edgeId: string) => void;
  onLongPress?: (edgeId: string, x: number, y: number) => void;
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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

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
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "#FFD700",
          strokeWidth: 3,
          cursor: "pointer",
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
      />
    </>
  );
}

export default memo(ConnectionEdgeComponent);
