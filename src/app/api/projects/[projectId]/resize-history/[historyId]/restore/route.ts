import { NextResponse } from "next/server";
import {
  buildConnectionsFromHistorySnapshot,
  buildPanelsFromHistorySnapshot,
  buildBranchStateSnapshot,
  fetchProjectBranchState,
  getProjectBranchSettings,
  replaceBranchState,
  type ProjectBranchState,
} from "@/lib/projectBranchState";
import {
  fetchProjectBranchContext,
  toBranchScopedProject,
} from "@/lib/projectBranches";
import { isRestorableResizeHistorySnapshot } from "@/lib/resizeHistory";
import { createClient } from "@/lib/supabase/server";
import type { BranchScopedProject, ProjectGridResizeHistory, ProjectBranch } from "@/types";

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

  return "履歴の復元に失敗しました";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; historyId: string }> }
) {
  const { projectId, historyId } = await context.params;
  const requestedBranchId = new URL(request.url).searchParams.get("branch");
  const supabase = await createClient();

  let currentBranch: ProjectBranch | null = null;
  let currentProject: BranchScopedProject | null = null;
  let currentState: ProjectBranchState | null = null;
  let createdRollbackHistoryId: string | null = null;

  try {
    const contextResult = await fetchProjectBranchContext(
      supabase,
      projectId,
      requestedBranchId
    );
    currentBranch = contextResult.currentBranch;
    currentProject = contextResult.projectView;
    currentState = await fetchProjectBranchState(
      supabase,
      projectId,
      contextResult.projectView,
      contextResult.currentBranch
    );

    const { data: history, error: historyError } = await supabase
      .from("project_grid_resize_history")
      .select("*")
      .eq("id", historyId)
      .eq("project_id", projectId)
      .eq("branch_id", currentBranch.id)
      .single();

    if (historyError || !history) {
      return NextResponse.json(
        { error: "復元対象の履歴が見つかりません" },
        { status: 404 }
      );
    }

    const typedHistory = history as ProjectGridResizeHistory;
    if (!isRestorableResizeHistorySnapshot(typedHistory.snapshot)) {
      return NextResponse.json(
        { error: "旧形式の履歴は復元できません" },
        { status: 400 }
      );
    }

    const { data: rollbackHistory, error: rollbackHistoryError } = await supabase
      .from("project_grid_resize_history")
      .insert({
        project_id: projectId,
        branch_id: currentBranch.id,
        from_grid_width: currentState.project.grid_width,
        from_grid_height: currentState.project.grid_height,
        to_grid_width: typedHistory.snapshot.project.grid_width,
        to_grid_height: typedHistory.snapshot.project.grid_height,
        auto_adjust_illustration: false,
        snapshot: buildBranchStateSnapshot(currentState),
      })
      .select("id")
      .single();

    if (rollbackHistoryError || !rollbackHistory) {
      throw rollbackHistoryError ?? new Error("復元前履歴の保存に失敗しました");
    }
    createdRollbackHistoryId = rollbackHistory.id;

    const updatedBranch = await replaceBranchState(supabase, {
      projectId,
      targetBranch: currentBranch,
      settings: {
        grid_width: typedHistory.snapshot.project.grid_width,
        grid_height: typedHistory.snapshot.project.grid_height,
        colors: typedHistory.snapshot.project.colors,
        default_panel_duration_ms:
          typedHistory.snapshot.project.default_panel_duration_ms,
        default_interval_ms: typedHistory.snapshot.project.default_interval_ms,
        music_data: typedHistory.snapshot.project.music_data,
      },
      panels: buildPanelsFromHistorySnapshot(
        projectId,
        currentBranch.id,
        typedHistory.snapshot.panels
      ),
      connections: buildConnectionsFromHistorySnapshot(
        projectId,
        currentBranch.id,
        typedHistory.snapshot.connections
      ),
      syncMainCache: currentBranch.is_main,
    });

    return NextResponse.json({
      project: toBranchScopedProject(currentProject, updatedBranch),
      restoredHistoryId: typedHistory.id,
      createdRollbackHistoryId,
    });
  } catch (error) {
    if (currentBranch && currentState) {
      try {
        await replaceBranchState(supabase, {
          projectId,
          targetBranch: currentBranch,
          settings: getProjectBranchSettings(currentState.project),
          panels: currentState.panels,
          connections: currentState.connections,
          syncMainCache: currentBranch.is_main,
        });
      } catch (rollbackError) {
        return NextResponse.json(
          {
            error: `復元に失敗し、ロールバックにも失敗しました: ${getErrorMessage(rollbackError)}`,
          },
          { status: 500 }
        );
      }
    }

    if (createdRollbackHistoryId && currentBranch) {
      const { error: cleanupError } = await supabase
        .from("project_grid_resize_history")
        .delete()
        .eq("id", createdRollbackHistoryId)
        .eq("branch_id", currentBranch.id);

      if (cleanupError) {
        return NextResponse.json(
          {
            error: `復元に失敗し、履歴クリーンアップにも失敗しました: ${getErrorMessage(cleanupError)}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
