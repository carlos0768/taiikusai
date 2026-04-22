"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { decodeGrid } from "@/lib/grid/codec";
import { findPlaybackRoutes } from "@/lib/api/connections";
import type { GridData } from "@/lib/grid/types";
import type { BranchContextResponse, Connection, ZentaiGamen } from "@/types";
import PlaybackView from "@/components/playback/PlaybackView";
import RouteSelector from "@/components/playback/RouteSelector";

export default function PlaybackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const startId = searchParams.get("start");
  const branchName = searchParams.get("branch") ?? "main";
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [routes, setRoutes] = useState<string[][]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState(50);
  const [gridHeight, setGridHeight] = useState(30);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const context = await fetchJson<BranchContextResponse>(
        `/api/projects/${projectId}/branches?branch=${branchName}`
      );

      const [{ data: nextZentaiGamen }, { data: nextConnections }] = await Promise.all([
        supabase
          .from("zentai_gamen")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", context.currentBranch.id),
        supabase
          .from("connections")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", context.currentBranch.id),
      ]);

      setGridWidth(context.project.grid_width);
      setGridHeight(context.project.grid_height);
      setZentaiGamen((nextZentaiGamen ?? []) as ZentaiGamen[]);

      const currentConnections = (nextConnections ?? []) as Connection[];
      if (startId && currentConnections) {
        const foundRoutes = findPlaybackRoutes(currentConnections, startId);
        setRoutes(foundRoutes);

        if (foundRoutes.length === 1) {
          setSelectedRoute(0);
        } else if (foundRoutes.length === 0) {
          setRoutes([[startId]]);
          setSelectedRoute(0);
        }
      }

      setLoading(false);
    }

    void load();
  }, [branchName, projectId, startId, supabase]);

  const handleBack = useCallback(() => {
    router.push(`/project/${projectId}${branchName === "main" ? "" : `?branch=${branchName}`}`);
  }, [branchName, projectId, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (selectedRoute === null && routes.length > 1) {
    const nodeNames = new Map(zentaiGamen.map((item) => [item.id, item.name]));
    return (
      <RouteSelector
        routes={routes}
        nodeNames={nodeNames}
        onSelect={setSelectedRoute}
        onBack={handleBack}
      />
    );
  }

  const route = routes[selectedRoute ?? 0] ?? [];
  const zentaiGamenMap = new Map(zentaiGamen.map((item) => [item.id, item]));
  const frames: GridData[] = [];
  const frameNames: string[] = [];

  route.forEach((nodeId) => {
    const item = zentaiGamenMap.get(nodeId);
    if (!item) return;
    frames.push(decodeGrid(item.grid_data, gridWidth, gridHeight));
    frameNames.push(item.name);
  });

  if (frames.length === 0) {
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

  return (
    <PlaybackView frames={frames} frameNames={frameNames} onBack={handleBack} />
  );
}
