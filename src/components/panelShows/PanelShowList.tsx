"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  deletePanelShow,
  getPanelShowsByProject,
} from "@/lib/api/panelShows";
import { buildBranchPath } from "@/lib/projectBranches";
import type { PanelShow } from "@/types";

export default function PanelShowList() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const branchId = searchParams.get("branch") ?? "";

  const [shows, setShows] = useState<PanelShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!branchId) {
        setShows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getPanelShowsByProject(projectId, branchId);
        if (!cancelled) setShows(data);
      } catch {
        if (!cancelled) setShows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [branchId, projectId]);

  async function handleDelete(id: string) {
    try {
      await deletePanelShow(id, branchId);
      setShows((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Public viewers can read panel shows but cannot delete persisted data.
    }
  }

  function openShow(id: string) {
    router.push(
      buildBranchPath(`/project/${projectId}/panel-shows/${id}`, branchId)
    );
  }

  if (!loading && shows.length === 0) {
    return (
      <p className="text-muted text-center py-8">パネルショーがありません</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {shows.map((show) => (
        <div
          key={show.id}
          onClick={() => openShow(show.id)}
          className="bg-card border border-card-border rounded-lg overflow-hidden hover:border-accent/50 transition-colors cursor-pointer p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm truncate">{show.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(show.id);
              }}
              className="text-xs text-muted hover:text-danger transition-colors ml-2 shrink-0"
            >
              削除
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            {show.panel_ids.length}枚 / {show.rows}×{show.cols}
          </p>
        </div>
      ))}
    </div>
  );
}
