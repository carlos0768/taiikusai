"use client";

import { memo } from "react";
import {
  BaseEdge,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";

function ConnectionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: "#FFD700",
        strokeWidth: 2,
        ...style,
      }}
      markerEnd={markerEnd}
    />
  );
}

export default memo(ConnectionEdgeComponent);
