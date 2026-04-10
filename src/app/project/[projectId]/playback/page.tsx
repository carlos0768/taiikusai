"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid } from "@/lib/grid/codec";
import { findPlaybackRoutes } from "@/lib/api/connections";
import type { GridData } from "@/lib/grid/types";
import type { ZentaiGamen, Connection } from "@/types";
import PlaybackView from "@/components/playback/PlaybackView";
import RouteSelector from "@/components/playback/RouteSelector";

export default function PlaybackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const startId = searchParams.get("start");

  const [loading, setLoading] = useState(true);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [routes, setRoutes] = useState<string[][]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState(50);
  const [gridHeight, setGridHeight] = useState(30);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [{ data: proj }, { data: zg }, { data: conns }] =
        await Promise.all([
          supabase.from("projects").select("*").eq("id", projectId).single(),
          supabase
            .from("zentai_gamen")
            .select("*")
            .eq("project_id", projectId),
          supabase
            .from("connections")
            .select("*")
            .eq("project_id", projectId),
        ]);

      if (proj) {
        setGridWidth(proj.grid_width);
        setGridHeight(proj.grid_height);
      }
      setZentaiGamen(zg ?? []);
      setConnections(conns ?? []);

      if (startId && conns) {
        const foundRoutes = findPlaybackRoutes(conns, startId);
        setRoutes(foundRoutes);

        // If only one route, auto-select
        if (foundRoutes.length === 1) {
          setSelectedRoute(0);
        } else if (foundRoutes.length === 0) {
          // No connections, just show this single frame
          setRoutes([[startId]]);
          setSelectedRoute(0);
        }
      }

      setLoading(false);
    }
    load();
  }, [projectId, startId]);

  const handleBack = useCallback(() => {
    router.push(`/project/${projectId}`);
  }, [projectId, router]);

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

  // Build frames for playback
  const route = routes[selectedRoute ?? 0] ?? [];
  const zgMap = new Map(zentaiGamen.map((zg) => [zg.id, zg]));
  const frames: GridData[] = [];
  const frameNames: string[] = [];

  for (const nodeId of route) {
    const zg = zgMap.get(nodeId);
    if (zg) {
      frames.push(decodeGrid(zg.grid_data, gridWidth, gridHeight));
      frameNames.push(zg.name);
    }
  }

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
