"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import JSZip from "jszip";
import GridEditor from "@/components/editor/GridEditor";
import { fetchJson } from "@/lib/client/api";
import { createClient } from "@/lib/supabase/client";
import { findPlaybackRoutes } from "@/lib/api/connections";
import { decodeGrid } from "@/lib/grid/codec";
import { generateScriptHtml } from "@/lib/export/generateScript";
import type { GridData, ColorIndex } from "@/lib/grid/types";
import type {
  BranchContextResponse,
  Connection,
  ZentaiGamen,
} from "@/types";

interface EditorState {
  context: BranchContextResponse;
  zentaiGamen: ZentaiGamen;
}

export default function EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const zentaiGamenId = params.zentaiGamenId as string;
  const branchName = searchParams.get("branch") ?? "main";
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<EditorState | null>(null);
  const [grid, setGrid] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const context = await fetchJson<BranchContextResponse>(
          `/api/projects/${projectId}/branches?branch=${branchName}`
        );

        const { data: zentaiGamen, error: zentaiGamenError } = await supabase
          .from("zentai_gamen")
          .select("*")
          .eq("id", zentaiGamenId)
          .eq("branch_id", context.currentBranch.id)
          .single();

        if (zentaiGamenError || !zentaiGamen) {
          throw zentaiGamenError ?? new Error("対象の画面が見つかりません");
        }

        setState({
          context,
          zentaiGamen: zentaiGamen as ZentaiGamen,
        });
        setGrid(
          decodeGrid(
            (zentaiGamen as ZentaiGamen).grid_data,
            context.project.grid_width,
            context.project.grid_height
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "エディタを読み込めませんでした");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [branchName, projectId, supabase, zentaiGamenId]);

  const handleSave = useCallback(
    async (gridData: string, name: string, memo: string) => {
      const { error: updateError } = await supabase
        .from("zentai_gamen")
        .update({
          grid_data: gridData,
          name,
          memo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", zentaiGamenId);

      if (updateError) {
        throw updateError;
      }
    },
    [supabase, zentaiGamenId]
  );

  const handleExport = useCallback(async () => {
    if (!state) return;

    const [{ data: allZentaiGamen, error: zentaiGamenError }, { data: allConnections, error: connectionsError }] =
      await Promise.all([
        supabase
          .from("zentai_gamen")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", state.context.currentBranch.id),
        supabase
          .from("connections")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", state.context.currentBranch.id),
      ]);

    if (zentaiGamenError || connectionsError || !allZentaiGamen || !allConnections) {
      throw new Error("データの取得に失敗しました");
    }

    const routes = findPlaybackRoutes(
      allConnections as Connection[],
      zentaiGamenId
    );
    const route = routes[0];
    if (!route || route.length === 0) {
      throw new Error("連結された全体画面がありません");
    }

    const zentaiGamenMap = new Map(
      (allZentaiGamen as ZentaiGamen[]).map((item) => [item.id, item])
    );
    const scenes: { grid: GridData; memo: string }[] = [];

    route.forEach((nodeId) => {
      const item = zentaiGamenMap.get(nodeId);
      if (!item) return;

      scenes.push({
        grid: decodeGrid(
          item.grid_data,
          state.context.project.grid_width,
          state.context.project.grid_height
        ),
        memo: item.memo || "",
      });
    });

    if (scenes.length === 0) {
      throw new Error("シーンデータがありません");
    }

    const zip = new JSZip();
    const width = state.context.project.grid_width;
    const height = state.context.project.grid_height;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellScenes = scenes.map((scene, index) => ({
          sceneNumber: index + 1,
          colorIndex: scene.grid.cells[y * width + x] as ColorIndex,
          memo: scene.memo,
        }));

        const html = generateScriptHtml(
          x,
          y,
          cellScenes,
          state.context.project.name
        );

        zip.file(`${y + 1}列${x + 1}番.html`, html);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.context.project.name}_パネル台本.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [projectId, state, supabase, zentaiGamenId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!state || !grid) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">{error ?? "データが見つかりません"}</p>
      </div>
    );
  }

  return (
    <GridEditor
      initialGrid={grid}
      zentaiGamenId={zentaiGamenId}
      projectId={projectId}
      initialName={state.zentaiGamen.name}
      initialMemo={state.zentaiGamen.memo || ""}
      onSave={handleSave}
      onExport={handleExport}
      auth={state.context.auth}
      project={state.context.project}
      currentBranch={state.context.currentBranch}
      branches={state.context.branches}
      unreadGitNotifications={state.context.unreadGitNotifications}
      canEditCurrentBranch={state.context.canEditCurrentBranch}
      canCreateBranches={state.context.canCreateBranches}
      canRequestMerge={state.context.canRequestMerge}
    />
  );
}
