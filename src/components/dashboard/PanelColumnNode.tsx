"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

interface PanelColumnNodeData {
  label: string;
  [key: string]: unknown;
}

function PanelColumnNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as PanelColumnNodeData;

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-emerald-400/60 bg-emerald-400/10 text-2xl font-bold text-emerald-200 shadow-lg">
      {nodeData.label}
    </div>
  );
}

export default memo(PanelColumnNodeComponent);
