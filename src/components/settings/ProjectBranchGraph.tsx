"use client";

import type { ProjectBranch, ProjectBranchMerge } from "@/types";

interface ProjectBranchGraphProps {
  branches: ProjectBranch[];
  merges: ProjectBranchMerge[];
  currentBranchId: string;
}

export default function ProjectBranchGraph({
  branches,
  merges,
  currentBranchId,
}: ProjectBranchGraphProps) {
  const mainBranch = branches.find((branch) => branch.is_main) ?? branches[0];

  if (!mainBranch) {
    return (
      <p className="text-sm text-muted">ブランチ情報がまだありません。</p>
    );
  }

  const sortedBranches = [
    mainBranch,
    ...branches
      .filter((branch) => branch.id !== mainBranch.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  ];
  const rowIndexByBranchId = new Map(
    sortedBranches.map((branch, index) => [branch.id, index])
  );

  const eventKeys = Array.from(
    new Set([
      mainBranch.created_at,
      ...sortedBranches.map((branch) => branch.created_at),
      ...merges.map((merge) => merge.created_at),
      "now",
    ])
  ).sort((a, b) => {
    if (a === "now") return 1;
    if (b === "now") return -1;
    return a.localeCompare(b);
  });

  const xForEvent = (eventKey: string) => 56 + eventKeys.indexOf(eventKey) * 132;
  const yForRow = (row: number) => 44 + row * 72;
  const width = Math.max(720, 120 + eventKeys.length * 132);
  const height = Math.max(180, 96 + sortedBranches.length * 72);
  const endX = xForEvent("now");

  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-background/40 p-3">
      <svg width={width} height={height} className="min-w-full">
        {sortedBranches.map((branch) => {
          const row = rowIndexByBranchId.get(branch.id) ?? 0;
          const y = yForRow(row);
          const startX = xForEvent(branch.is_main ? mainBranch.created_at : branch.created_at);
          const isCurrent = branch.id === currentBranchId;

          return (
            <g key={branch.id}>
              <line
                x1={startX}
                y1={y}
                x2={endX}
                y2={y}
                stroke={isCurrent ? "#FFD700" : "#8A8A8A"}
                strokeWidth={isCurrent ? 3 : 2}
                strokeLinecap="round"
              />
              <circle
                cx={startX}
                cy={y}
                r={branch.is_main ? 6 : 5}
                fill={isCurrent ? "#FFD700" : "#1E1E1E"}
                stroke={isCurrent ? "#FFD700" : "#8A8A8A"}
                strokeWidth="2"
              />
              <text
                x={endX + 12}
                y={y + 4}
                fill={isCurrent ? "#FFD700" : "#E5E5E5"}
                fontSize="12"
                fontWeight={isCurrent ? "700" : "500"}
              >
                {branch.name}
              </text>
            </g>
          );
        })}

        {sortedBranches
          .filter((branch) => !branch.is_main && branch.source_branch_id)
          .map((branch) => {
            const sourceRow = rowIndexByBranchId.get(branch.source_branch_id ?? "");
            const branchRow = rowIndexByBranchId.get(branch.id);
            if (sourceRow === undefined || branchRow === undefined) return null;

            const x = xForEvent(branch.created_at);
            const sourceY = yForRow(sourceRow);
            const branchY = yForRow(branchRow);

            return (
              <g key={`${branch.id}-fork`}>
                <line
                  x1={x}
                  y1={sourceY}
                  x2={x}
                  y2={branchY}
                  stroke="#5C5C5C"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx={x} cy={branchY} r="4" fill="#1E1E1E" stroke="#5C5C5C" />
              </g>
            );
          })}

        {merges.map((merge) => {
          const sourceRow = rowIndexByBranchId.get(merge.source_branch_id);
          const targetRow = rowIndexByBranchId.get(merge.target_branch_id);
          if (sourceRow === undefined || targetRow === undefined) return null;

          const x = xForEvent(merge.created_at);
          const sourceY = yForRow(sourceRow);
          const targetY = yForRow(targetRow);

          return (
            <g key={merge.id}>
              <line
                x1={x}
                y1={sourceY}
                x2={x}
                y2={targetY}
                stroke="#3FB950"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx={x} cy={sourceY} r="4" fill="#3FB950" />
              <circle cx={x} cy={targetY} r="4" fill="#3FB950" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
