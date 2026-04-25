"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";
import { findPlaybackRoutes } from "@/lib/api/connections";
import type {
  BranchContextResponse,
  BranchScopedProject,
  ZentaiGamen,
  Connection,
} from "@/types";
import { buildPlaybackTimeline } from "@/lib/playback/frameBuilder";
import PlaybackView from "@/components/playback/PlaybackView";
import RouteSelector from "@/components/playback/RouteSelector";

export default function PlaybackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const startId = searchParams.get("start");
  const requestedBranchId = searchParams.get("branch");

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [routes, setRoutes] = useState<string[][]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);

  const backHref = buildBranchPath(
    `/project/${projectId}`,
    requestedBranchId ?? project?.active_branch_id ?? ""
  );

  useEffect(() => {
    prefetchRoutes(router, [backHref]);
  }, [backHref, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setSelectedRoute(null);
      setRoutes([]);
      try {
        const contextParams = new URLSearchParams({ includeState: "1" });
        if (requestedBranchId) {
          contextParams.set("branch", requestedBranchId);
        }

        const contextResult = await fetchJson<BranchContextResponse>(
          `/api/projects/${projectId}/branches?${contextParams.toString()}`
        );
        const zg = contextResult.zentaiGamen ?? [];
        const conns = contextResult.connections ?? [];

        setProject(contextResult.project);
        setZentaiGamen(zg);
        setConnections(conns);

        if (startId && conns) {
          const foundRoutes = findPlaybackRoutes(conns, startId);
          setRoutes(foundRoutes);

          if (foundRoutes.length === 1) {
            setSelectedRoute(0);
          } else if (foundRoutes.length === 0) {
            setRoutes([[startId]]);
            setSelectedRoute(0);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectId, requestedBranchId, startId]);

  const handleBack = useCallback(() => {
    router.push(backHref);
  }, [backHref, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  // Route selection needed
  if (selectedRoute === null && routes.length > 1) {
    const nodeNames = new Map(zentaiGamen.map((zg) => [zg.id, zg.name]));
    return (
      <RouteSelector
        routes={routes}
        nodeNames={nodeNames}
        onSelect={setSelectedRoute}
        onBack={handleBack}
      />
    );
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">プロジェクトが見つかりません</p>
      </div>
    );
  }

  const route = routes[selectedRoute ?? 0] ?? [];
  const timeline = buildPlaybackTimeline({
    route,
    zentaiGamen,
    connections,
    gridWidth: project.grid_width,
    gridHeight: project.grid_height,
    defaultPanelDurationMs: project.default_panel_duration_ms,
    defaultIntervalMs: project.default_interval_ms,
  });

  if (timeline.frameItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">再生するフレームがありません</p>
          <button
            onClick={handleBack}
            className="text-accent hover:opacity-80 transition-opacity"
          >
            ← ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  return <PlaybackView timeline={timeline} onBack={handleBack} />;
}
