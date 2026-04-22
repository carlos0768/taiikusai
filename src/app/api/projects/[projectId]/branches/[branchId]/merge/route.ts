import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
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
import { HttpError, toErrorResponse } from "@/lib/server/errors";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; branchId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    if (!profile.is_admin) {
      throw new HttpError(403, "admin のみ直接 merge できます");
    }

    const { projectId, branchId } = await context.params;
    const supabase = await createClient();
    let project: Project | null = null;
    let mainBranch: ProjectBranch | null = null;
    let mainState: ProjectBranchState | null = null;

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
    return toErrorResponse(
      error instanceof Error ? error : new Error("ブランチの merge に失敗しました")
    );
  }
}
