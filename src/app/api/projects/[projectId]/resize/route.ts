import { NextResponse } from "next/server";
import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import {
  resizeGrid,
  resizeWaveGrids,
  type GridResizeOptions,
} from "@/lib/grid/resize";
import { createClient } from "@/lib/supabase/server";
import type { WaveMotionData, ZentaiGamen } from "@/types";

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

  const preparedUpdates: PreparedPanelUpdate[] = [];
  let resizedWavePanelCount = 0;

  for (const panel of panels ?? []) {
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
    (panels ?? []).map((panel) => [
      panel.id,
      {
        gridData: panel.grid_data,
        motionData: panel.motion_data ?? null,
      },
    ])
  );
  const appliedPanelIds: string[] = [];

  try {
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

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "プロジェクトのリサイズに失敗しました",
      },
      { status: 500 }
    );
  }
}
