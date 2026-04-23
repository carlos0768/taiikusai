"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { decodeGrid } from "@/lib/grid/codec";
import {
  countUndefinedCells,
  getPlaybackFrameFinalGrid,
  type ColorIndex,
  type GridData,
} from "@/lib/grid/types";
import GridEditor, { type GridEditorSavePayload } from "@/components/editor/GridEditor";
import { findPlaybackRoutes } from "@/lib/api/connections";
import { generateScriptHtml } from "@/lib/export/generateScript";
import { decodeKeepMask, filterKeepMaskBySameColor, isKeepCell } from "@/lib/keep";
import { zentaiGamenToPlaybackFrame } from "@/lib/playback/frameBuilder";
import type { BranchContextResponse, Connection, ZentaiGamen } from "@/types";

export default function EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const zentaiGamenId = params.zentaiGamenId as string;
  const requestedBranchId = searchParams.get("branch");
  const supabase = useMemo(() => createClient(), []);

  const [context, setContext] = useState<BranchContextResponse | null>(null);
  const [grid, setGrid] = useState<GridData | null>(null);
  const [afterGrid, setAfterGrid] = useState<GridData | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextContext = await fetchJson<BranchContextResponse>(
          `/api/projects/${projectId}/branches${
            requestedBranchId ? `?branch=${requestedBranchId}` : ""
          }`
        );

        const { data: zg, error: zentaiGamenError } = await supabase
          .from("zentai_gamen")
          .select("*")
          .eq("id", zentaiGamenId)
          .eq("project_id", projectId)
          .eq("branch_id", nextContext.currentBranch.id)
          .single();

        if (zentaiGamenError || !zg) {
          throw zentaiGamenError ?? new Error("対象の画面が見つかりません");
        }

        setContext(nextContext);
        setZentaiGamen(zg as ZentaiGamen);
        setGrid(
          decodeGrid(
            zg.grid_data,
            nextContext.project.grid_width,
            nextContext.project.grid_height
          )
        );

        if (
          zg.panel_type === "motion" &&
          zg.motion_type === "wave" &&
          zg.motion_data
        ) {
          setAfterGrid(
            decodeGrid(
              zg.motion_data.after_grid_data,
              nextContext.project.grid_width,
              nextContext.project.grid_height
            )
          );
        } else {
          setAfterGrid(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "エディタを読み込めませんでした");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [projectId, requestedBranchId, supabase, zentaiGamenId]);

  const handleSave = useCallback(
    async (payload: GridEditorSavePayload) => {
      if (!context) return;

      const update: Record<string, unknown> = {
        grid_data: payload.gridData,
        name: payload.name,
        memo: payload.memo,
        updated_at: new Date().toISOString(),
      };
      if (payload.motionData !== undefined) {
        update.motion_data = payload.motionData;
      }

      const { error: updateError } = await supabase
        .from("zentai_gamen")
        .update(update)
        .eq("id", zentaiGamenId)
        .eq("project_id", projectId)
        .eq("branch_id", context.currentBranch.id);

      if (updateError) {
        throw updateError;
      }
    },
    [context, projectId, supabase, zentaiGamenId]
  );

  const handleExport = useCallback(async () => {
    if (!context) return;

    const [{ data: allZg, error: zentaiGamenError }, { data: allConns, error: connectionsError }] =
      await Promise.all([
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

    if (zentaiGamenError || connectionsError || !allZg || !allConns) {
      throw new Error("データの取得に失敗しました");
    }

    const routes = findPlaybackRoutes(allConns as Connection[], zentaiGamenId);
    const route = routes[0];
    if (!route || route.length === 0) {
      throw new Error("連結された全体画面がありません");
    }

    const zentaiGamenMap = new Map(
      (allZg as ZentaiGamen[]).map((item) => [item.id, item])
    );
    const width = context.project.grid_width;
    const height = context.project.grid_height;
    const connectionMap = new Map(
      (allConns as Connection[]).map((connection) => [
        `${connection.source_id}:${connection.target_id}`,
        connection,
      ])
    );
    const scenes: {
      name: string;
      grid: GridData;
      beforeGrid: GridData | null;
      keepMask: GridData | null;
      memo: string;
    }[] = [];

    route.forEach((nodeId, index) => {
      const item = zentaiGamenMap.get(nodeId);
      if (!item) return;

      const frame = zentaiGamenToPlaybackFrame({
        zentaiGamen: item,
        gridWidth: width,
        gridHeight: height,
        defaultPanelDurationMs: context.project.default_panel_duration_ms,
      });
      const grid = getPlaybackFrameFinalGrid(frame);
      const previousNodeId = route[index - 1];
      const previousConnection = previousNodeId
        ? connectionMap.get(`${previousNodeId}:${nodeId}`)
        : null;
      const previousScene = scenes[scenes.length - 1];
      const rawKeepMask = decodeKeepMask(
        previousConnection?.keep_mask_grid_data,
        width,
        height
      );
      const keepMask =
        rawKeepMask && previousScene
          ? filterKeepMaskBySameColor(previousScene.grid, grid, rawKeepMask)
          : null;

      scenes.push({
        name: item.name,
        grid,
        beforeGrid: frame.kind === "wave" ? frame.before : null,
        keepMask,
        memo: item.memo || "",
      });
    });

    if (scenes.length === 0) {
      throw new Error("シーンデータがありません");
    }

    const undefinedReport: { name: string; count: number }[] = [];
    for (const scene of scenes) {
      const count =
        countUndefinedCells(scene.grid) +
        (scene.beforeGrid ? countUndefinedCells(scene.beforeGrid) : 0);
      if (count > 0) {
        undefinedReport.push({ name: scene.name, count });
      }
    }

    if (undefinedReport.length > 0) {
      const lines = undefinedReport
        .map((r) => `・${r.name}（${r.count}セル）`)
        .join("\n");
      const ok = window.confirm(
        `連結されたパネルに未塗りのセルが残っています。\n\n${lines}\n\nこのまま出力しますか？`
      );
      if (!ok) return;
    }

    const zip = new JSZip();

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellIndex = y * width + x;
        const cellScenes = scenes.map((scene, index) => ({
          sceneNumber: index + 1,
          action: isKeepCell(scene.keepMask, cellIndex)
            ? ("keep" as const)
            : ("color" as const),
          colorIndex: scene.grid.cells[cellIndex] as ColorIndex,
          memo: scene.memo,
        }));

        const html = generateScriptHtml(
          x,
          y,
          cellScenes,
          context.project.name
        );

        zip.file(`${y + 1}列${x + 1}番.html`, html);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${context.project.name}_パネル台本.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [context, projectId, supabase, zentaiGamenId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (error || !context || !grid || !zentaiGamen) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">{error ?? "データが見つかりません"}</p>
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
      branchId={context.currentBranch.id}
      initialName={zentaiGamen.name}
      initialMemo={zentaiGamen.memo || ""}
      onSave={handleSave}
      onExport={handleExport}
      auth={context.auth}
      currentBranch={context.currentBranch}
      branches={context.branches}
      unreadGitNotifications={context.unreadGitNotifications}
      canEditCurrentBranch={context.canEditCurrentBranch}
      canCreateBranches={context.canCreateBranches}
      canRequestMerge={context.canRequestMerge}
    />
  );
}
