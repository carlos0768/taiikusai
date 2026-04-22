import { NextResponse } from "next/server";
import {
  buildBranchStateSnapshot,
  cloneConnectionsToBranch,
  clonePanelsToBranch,
  fetchProjectBranchState,
  getProjectBranchSettings,
  type ProjectBranchState,
  replaceBranchState,
} from "@/lib/projectBranchState";
import {
  fetchProjectBranchContext,
  toBranchScopedProject,
} from "@/lib/projectBranches";
import type { Project, ProjectBranch } from "@/types";
import { createClient } from "@/lib/supabase/server";

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

  return "ブランチの merge に失敗しました";
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; branchId: string }> }
) {
  const { projectId, branchId } = await context.params;
  const supabase = await createClient();

  let createdMergeId: string | null = null;
  let project: Project | null = null;
  let mainBranch: ProjectBranch | null = null;
  let mainState: ProjectBranchState | null = null;

  try {
    const contextResult = await fetchProjectBranchContext(
      supabase,
      projectId,
      branchId
    );
    project = contextResult.project;
    mainBranch = contextResult.mainBranch;

    const sourceBranch = contextResult.branches.find(
      (branch) => branch.id === branchId
    );
    if (!sourceBranch) {
      return NextResponse.json(
        { error: "merge 元のブランチが見つかりません" },
        { status: 404 }
      );
    }

    if (sourceBranch.is_main || sourceBranch.id === mainBranch.id) {
      return NextResponse.json(
        { error: "`main` ブランチは merge 元にできません" },
        { status: 400 }
      );
    }

    const [loadedMainState, sourceState] = await Promise.all([
      fetchProjectBranchState(
        supabase,
        projectId,
        toBranchScopedProject(project, mainBranch),
        mainBranch
      ),
      fetchProjectBranchState(
        supabase,
        projectId,
        toBranchScopedProject(project, sourceBranch),
        sourceBranch
      ),
    ]);
    mainState = loadedMainState;

    const { data: mergeRow, error: mergeInsertError } = await supabase
      .from("project_branch_merges")
      .insert({
        project_id: projectId,
        source_branch_id: sourceBranch.id,
        target_branch_id: mainBranch.id,
        snapshot: buildBranchStateSnapshot(mainState),
      })
      .select("id")
      .single();

    if (mergeInsertError || !mergeRow) {
      throw mergeInsertError ?? new Error("merge ログの保存に失敗しました");
    }

    createdMergeId = mergeRow.id;

    const { panels, idMap } = clonePanelsToBranch({
      projectId,
      branchId: mainBranch.id,
      panels: sourceState.panels,
    });
    const connections = cloneConnectionsToBranch({
      projectId,
      branchId: mainBranch.id,
      connections: sourceState.connections,
      panelIdMap: idMap,
    });

    const updatedMainBranch = await replaceBranchState(supabase, {
      projectId,
      targetBranch: mainBranch,
      settings: getProjectBranchSettings(sourceState.project),
      panels,
      connections,
      syncMainCache: true,
    });

    return NextResponse.json({
      mainBranch: updatedMainBranch,
      mergedFromBranchId: sourceBranch.id,
    });
  } catch (error) {
    try {
      if (mainBranch && mainState) {
        await replaceBranchState(supabase, {
          projectId,
          targetBranch: mainBranch,
          settings: getProjectBranchSettings(mainState.project),
          panels: mainState.panels,
          connections: mainState.connections,
          syncMainCache: true,
        });
      }

      if (createdMergeId) {
        await supabase
          .from("project_branch_merges")
          .delete()
          .eq("id", createdMergeId);
      }
    } catch {
      return NextResponse.json(
        { error: `merge に失敗しました。${getErrorMessage(error)}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
