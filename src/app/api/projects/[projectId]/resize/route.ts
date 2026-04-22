import { NextResponse } from "next/server";
import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import {
  fetchBranchPanels,
  getProjectBranchSettings,
} from "@/lib/projectBranchState";
import {
  fetchProjectBranchContext,
  syncMainProjectCache,
  toBranchScopedProject,
} from "@/lib/projectBranches";
import {
  resizeGrid,
  resizeWaveGrids,
  type GridResizeOptions,
} from "@/lib/grid/resize";
import { createClient } from "@/lib/supabase/server";
import type {
  BranchScopedProject,
  ProjectBranch,
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

function isValidGridSize(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 200;
}

function isWavePanel(
  zentaiGamen: ZentaiGamen
): zentaiGamen is ZentaiGamen & { motion_data: WaveMotionData } {
  return (
    zentaiGamen.panel_type === "motion" &&
    zentaiGamen.motion_type === "wave" &&
    zentaiGamen.motion_data !== null
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const requestedBranchId = new URL(request.url).searchParams.get("branch");

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
  let projectView!: BranchScopedProject;
  let currentBranch!: ProjectBranch;
  let panels: ZentaiGamen[] = [];

  try {
    const contextResult = await fetchProjectBranchContext(
      supabase,
      projectId,
      requestedBranchId
    );
    projectView = contextResult.projectView;
    currentBranch = contextResult.currentBranch;
    panels = await fetchBranchPanels(supabase, projectId, currentBranch.id);
  } catch {
    return NextResponse.json(
      { error: "プロジェクトまたはブランチの取得に失敗しました" },
      { status: 404 }
    );
  }

  if (
    projectView.grid_width === gridWidth &&
    projectView.grid_height === gridHeight
  ) {
    return NextResponse.json({
      project: projectView,
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
      projectView.grid_width,
      projectView.grid_height
    );

    if (isWavePanel(panel)) {
      const afterGrid = decodeGrid(
        panel.motion_data.after_grid_data,
        projectView.grid_width,
        projectView.grid_height
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
  let branchUpdated = false;

  try {
    for (const update of preparedUpdates) {
      const { error } = await supabase
        .from("zentai_gamen")
        .update({
          grid_data: update.gridData,
          motion_data: update.motionData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", update.id)
        .eq("branch_id", currentBranch.id);

      if (error) throw error;
      appliedPanelIds.push(update.id);
    }

    const { data: updatedBranch, error: updateBranchError } = await supabase
      .from("project_branches")
      .update({
        grid_width: gridWidth,
        grid_height: gridHeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentBranch.id)
      .select("*")
      .single();

    if (updateBranchError || !updatedBranch) {
      throw updateBranchError ?? new Error("Project branch update failed");
    }
    branchUpdated = true;

    if (currentBranch.is_main) {
      await syncMainProjectCache(supabase, projectId, {
        ...getProjectBranchSettings(projectView),
        grid_width: gridWidth,
        grid_height: gridHeight,
      });
    }

    return NextResponse.json({
      project: toBranchScopedProject(
        {
          ...projectView,
          updated_at: updatedBranch.updated_at,
        },
        updatedBranch
      ),
      resizedPanelCount: preparedUpdates.length,
      resizedWavePanelCount,
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
        .eq("id", panelId)
        .eq("branch_id", currentBranch.id);
    }

    if (branchUpdated) {
      await supabase
        .from("project_branches")
        .update({
          ...getProjectBranchSettings(projectView),
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentBranch.id);

      if (currentBranch.is_main) {
        await syncMainProjectCache(
          supabase,
          projectId,
          getProjectBranchSettings(projectView)
        );
      }
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
