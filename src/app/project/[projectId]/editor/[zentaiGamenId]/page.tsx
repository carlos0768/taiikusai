"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid } from "@/lib/grid/codec";
import { getPlaybackFrameFinalGrid } from "@/lib/grid/types";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import type { GridData } from "@/lib/grid/types";
import type { ColorIndex } from "@/lib/grid/types";
import GridEditor, { type GridEditorSavePayload } from "@/components/editor/GridEditor";
import { findPlaybackRoutes } from "@/lib/api/connections";
import { generateScriptHtml } from "@/lib/export/generateScript";
import { isKeepMaskSelected } from "@/lib/keep";
import { zentaiGamenToPlaybackFrame } from "@/lib/playback/frameBuilder";
import type { BranchScopedProject, ZentaiGamen } from "@/types";
import JSZip from "jszip";

export default function EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const zentaiGamenId = params.zentaiGamenId as string;
  const requestedBranchId = searchParams.get("branch");
  const [grid, setGrid] = useState<GridData | null>(null);
  const [afterGrid, setAfterGrid] = useState<GridData | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen | null>(null);
  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const contextResult = await fetchProjectBranchContext(
          supabase,
          projectId,
          requestedBranchId
        );

        const { data: zg } = await supabase
          .from("zentai_gamen")
          .select("*")
          .eq("id", zentaiGamenId)
          .eq("project_id", projectId)
          .eq("branch_id", contextResult.currentBranch.id)
          .single();

        if (zg) {
          setZentaiGamen(zg);
          setProject(contextResult.projectView);
          const gridData = decodeGrid(
            zg.grid_data,
            contextResult.projectView.grid_width,
            contextResult.projectView.grid_height
          );
          setGrid(gridData);
          if (
            zg.panel_type === "motion" &&
            zg.motion_type === "wave" &&
            zg.motion_data
          ) {
            setAfterGrid(
              decodeGrid(
                zg.motion_data.after_grid_data,
                contextResult.projectView.grid_width,
                contextResult.projectView.grid_height
              )
            );
          }
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectId, requestedBranchId, supabase, zentaiGamenId]);

  const handleSave = useCallback(
    async (payload: GridEditorSavePayload) => {
      const update: Record<string, unknown> = {
        grid_data: payload.gridData,
        name: payload.name,
        memo: payload.memo,
        updated_at: new Date().toISOString(),
      };
      if (payload.motionData !== undefined) {
        update.motion_data = payload.motionData;
      }
      await supabase
        .from("zentai_gamen")
        .update(update)
        .eq("id", zentaiGamenId)
        .eq("project_id", projectId)
        .eq("branch_id", project?.active_branch_id ?? "");
    },
    [zentaiGamenId, projectId, project?.active_branch_id, supabase]
  );

  const handleExport = useCallback(async () => {
    if (!project) return;

    // Fetch all zentai_gamen and connections for this project
    const [{ data: allZg }, { data: allConns }] = await Promise.all([
      supabase
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", project.active_branch_id),
      supabase
        .from("connections")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", project.active_branch_id),
    ]);

    if (!allZg || !allConns) {
      alert("データの取得に失敗しました");
      return;
    }

    // Find the route starting from this zentai_gamen
    const routes = findPlaybackRoutes(allConns, zentaiGamenId);
    const route = routes[0]; // Use first route
    if (!route || route.length === 0) {
      alert("連結された全体画面がありません");
      return;
    }

    // Build scene data
    const zgMap = new Map(allZg.map((z: ZentaiGamen) => [z.id, z]));
    const scenes: {
      grid: GridData;
      keepMask: GridData | null;
      keepHasPreviousDisplay: boolean;
      memo: string;
    }[] = [];
    let previousVisibleGrid: GridData | null = null;

    for (const nodeId of route) {
      const zg = zgMap.get(nodeId);
      if (!zg) continue;

      const frame = zentaiGamenToPlaybackFrame({
        zentaiGamen: zg,
        gridWidth: project.grid_width,
        gridHeight: project.grid_height,
        defaultPanelDurationMs: project.default_panel_duration_ms,
        previousVisibleGrid,
        keepDurationMs: 0,
      });

      scenes.push({
        grid: getPlaybackFrameFinalGrid(frame),
        keepMask: frame.kind === "keep" ? frame.mask : null,
        keepHasPreviousDisplay:
          frame.kind === "keep" ? previousVisibleGrid !== null : false,
        memo: zg.memo || "",
      });
      previousVisibleGrid = getPlaybackFrameFinalGrid(frame);
    }

    if (scenes.length === 0) {
      alert("シーンデータがありません");
      return;
    }

    // Generate HTML for each cell position
    const zip = new JSZip();
    const w = project.grid_width;
    const h = project.grid_height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cellScenes = scenes.map((scene, idx) => ({
          sceneNumber: idx + 1,
          action:
            scene.keepMask &&
            scene.keepHasPreviousDisplay &&
            isKeepMaskSelected(scene.keepMask.cells[y * w + x])
              ? ("keep" as const)
              : ("color" as const),
          colorIndex: scene.grid.cells[y * w + x] as ColorIndex,
          memo: scene.memo,
        }));

        const html = generateScriptHtml(x, y, cellScenes, project.name);

        zip.file(`${y + 1}列${x + 1}番.html`, html);
      }
    }

    // Download ZIP
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}_パネル台本.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project, projectId, zentaiGamenId, supabase]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!grid || !zentaiGamen || !project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">データが見つかりません</p>
      </div>
    );
  }

  return (
    <GridEditor
      initialGrid={grid}
      initialAfterGrid={afterGrid}
      panelType={zentaiGamen.panel_type ?? "general"}
      motionType={zentaiGamen.motion_type ?? null}
      initialMotionData={zentaiGamen.motion_data ?? null}
      zentaiGamenId={zentaiGamenId}
      projectId={projectId}
      branchId={project.active_branch_id}
      initialName={zentaiGamen.name}
      initialMemo={zentaiGamen.memo || ""}
      onSave={handleSave}
      onExport={handleExport}
    />
  );
}
