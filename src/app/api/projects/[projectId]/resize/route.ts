import { NextResponse } from "next/server";
import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import {
  resizeGrid,
  resizeWaveGrids,
  type GridResizeOptions,
} from "@/lib/grid/resize";
import { createClient } from "@/lib/supabase/server";
import type {
  Project,
  ProjectGridResizeHistorySnapshot,
  ProjectGridResizeHistorySnapshotPanel,
  WaveMotionData,
  ZentaiGamen,
} from "@/types";

interface ResizeRequestBody {
  gridWidth: number;
  gridHeight: number;
  autoAdjustIllustration: boolean;
}

interface PreparedPanelUpdate {
  id: string;
  gridData: string;
  motionData: WaveMotionData | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "プロジェクトのリサイズに失敗しました";
}

function getResizeHistoryWarning(error: unknown): string | null {
  const message = getErrorMessage(error);
  const refersHistoryTable = message.includes("project_grid_resize_history");
  const isHistorySchemaError =
    refersHistoryTable &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("relation"));

  if (!isHistorySchemaError) return null;

  return "リサイズ履歴用のDBテーブルが未適用のため、今回は変更前状態を保存せずにリサイズしました。`supabase/migrations/20260422000000_add_project_grid_resize_history.sql` を適用してください。";
}

function isValidGridSize(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 200;
}

function isWavePanel(zentaiGamen: ZentaiGamen): boolean {
  return (
    zentaiGamen.panel_type === "motion" &&
    zentaiGamen.motion_type === "wave" &&
    zentaiGamen.motion_data !== null
  );
}

function buildSnapshotPanels(
  panels: ZentaiGamen[]
): ProjectGridResizeHistorySnapshotPanel[] {
  return panels.map((panel) => ({
    id: panel.id,
    name: panel.name,
    grid_data: panel.grid_data,
    position_x: panel.position_x,
    position_y: panel.position_y,
    memo: panel.memo,
    panel_type: panel.panel_type,
    motion_type: panel.motion_type,
    motion_data: panel.motion_data,
    panel_duration_override_ms: panel.panel_duration_override_ms,
    updated_at: panel.updated_at,
  }));
}

function buildResizeHistorySnapshot(
  project: Project,
  panels: ZentaiGamen[]
): ProjectGridResizeHistorySnapshot {
  return {
    project: {
      id: project.id,
      name: project.name,
      grid_width: project.grid_width,
      grid_height: project.grid_height,
      default_panel_duration_ms: project.default_panel_duration_ms,
      default_interval_ms: project.default_interval_ms,
    },
    panels: buildSnapshotPanels(panels),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  let body: ResizeRequestBody;
  try {
    body = (await request.json()) as ResizeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が不正です" },
      { status: 400 }
    );
  }

  const { gridWidth, gridHeight, autoAdjustIllustration } = body;
  if (!isValidGridSize(gridWidth) || !isValidGridSize(gridHeight)) {
    return NextResponse.json(
      { error: "マス数は 5〜200 の整数で指定してください" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const [{ data: project, error: projectError }, { data: panels, error: panelsError }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

  if (projectError || !project) {
    return NextResponse.json(
      { error: "プロジェクトが見つかりません" },
      { status: 404 }
    );
  }

  if (panelsError) {
    return NextResponse.json(
      { error: "パネル情報の取得に失敗しました" },
      { status: 500 }
    );
  }

  if (
    project.grid_width === gridWidth &&
    project.grid_height === gridHeight
  ) {
    return NextResponse.json({
      project,
      resizedPanelCount: panels?.length ?? 0,
      resizedWavePanelCount: (panels ?? []).filter(isWavePanel).length,
    });
  }

  const resizeOptions: GridResizeOptions = {
    targetWidth: gridWidth,
    targetHeight: gridHeight,
    autoAdjustIllustration,
  };

  const allPanels = panels ?? [];
  const preparedUpdates: PreparedPanelUpdate[] = [];
  let resizedWavePanelCount = 0;

  for (const panel of allPanels) {
    const beforeGrid = decodeGrid(
      panel.grid_data,
      project.grid_width,
      project.grid_height
    );

    if (isWavePanel(panel)) {
      const afterGrid = decodeGrid(
        panel.motion_data.after_grid_data,
        project.grid_width,
        project.grid_height
      );
      const resized = resizeWaveGrids(beforeGrid, afterGrid, resizeOptions);

      preparedUpdates.push({
        id: panel.id,
        gridData: encodeGrid(resized.before),
        motionData: {
          ...panel.motion_data,
          after_grid_data: encodeGrid(resized.after),
        },
      });
      resizedWavePanelCount += 1;
      continue;
    }

    preparedUpdates.push({
      id: panel.id,
      gridData: encodeGrid(resizeGrid(beforeGrid, resizeOptions)),
      motionData: panel.motion_data ?? null,
    });
  }

  const originalPanels = new Map(
    allPanels.map((panel) => [
      panel.id,
      {
        gridData: panel.grid_data,
        motionData: panel.motion_data ?? null,
      },
    ])
  );
  const appliedPanelIds: string[] = [];
  const resizeHistorySnapshot = buildResizeHistorySnapshot(project, allPanels);
  let resizeHistoryId: string | null = null;
  let warning: string | null = null;

  try {
    const { data: historyRow, error: historyError } = await supabase
      .from("project_grid_resize_history")
      .insert({
        project_id: projectId,
        from_grid_width: project.grid_width,
        from_grid_height: project.grid_height,
        to_grid_width: gridWidth,
        to_grid_height: gridHeight,
        auto_adjust_illustration: autoAdjustIllustration,
        snapshot: resizeHistorySnapshot,
      })
      .select("id")
      .single();

    if (historyError || !historyRow) {
      const historyWarning = getResizeHistoryWarning(
        historyError ?? new Error("Resize history insert failed")
      );
      if (historyWarning) {
        warning = historyWarning;
      } else {
        throw historyError ?? new Error("Resize history insert failed");
      }
    } else {
      resizeHistoryId = historyRow.id;
    }

    for (const update of preparedUpdates) {
      const { error } = await supabase
        .from("zentai_gamen")
        .update({
          grid_data: update.gridData,
          motion_data: update.motionData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", update.id);

      if (error) throw error;
      appliedPanelIds.push(update.id);
    }

    const { data: updatedProject, error: updateProjectError } = await supabase
      .from("projects")
      .update({
        grid_width: gridWidth,
        grid_height: gridHeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (updateProjectError || !updatedProject) {
      throw updateProjectError ?? new Error("Project update failed");
    }

    return NextResponse.json({
      project: updatedProject,
      resizedPanelCount: preparedUpdates.length,
      resizedWavePanelCount,
      warning,
    });
  } catch (error) {
    for (let index = appliedPanelIds.length - 1; index >= 0; index--) {
      const panelId = appliedPanelIds[index];
      const original = originalPanels.get(panelId);
      if (!original) continue;

      await supabase
        .from("zentai_gamen")
        .update({
          grid_data: original.gridData,
          motion_data: original.motionData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", panelId);
    }

    if (resizeHistoryId) {
      await supabase
        .from("project_grid_resize_history")
        .delete()
        .eq("id", resizeHistoryId);
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
