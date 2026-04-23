import { NextResponse } from "next/server";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import { requireAuth, requirePermission } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse } from "@/lib/server/errors";

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

  return "ブランチの削除に失敗しました";
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; branchId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    requirePermission(profile, "can_create_branches");

    const { projectId, branchId } = await context.params;
    const supabase = await createClient();
    const { branches, mainBranch } = await fetchProjectBranchContext(
      supabase,
      projectId,
      branchId
    );

    const targetBranch = branches.find((branch) => branch.id === branchId);
    if (!targetBranch) {
      return NextResponse.json(
        { error: "削除対象のブランチが見つかりません" },
        { status: 404 }
      );
    }

    if (targetBranch.id === mainBranch.id || targetBranch.is_main) {
      return NextResponse.json(
        { error: "`main` ブランチは削除できません" },
        { status: 400 }
      );
    }

    if (!profile.is_admin && targetBranch.created_by !== profile.id) {
      return NextResponse.json(
        { error: "他アカウントが作成したブランチは削除できません" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("project_branches")
      .delete()
      .eq("id", branchId)
      .eq("project_id", projectId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      deletedBranchId: branchId,
      fallbackBranchId: mainBranch.id,
    });
  } catch (error) {
    return toErrorResponse(
      error instanceof Error ? error : new Error(getErrorMessage(error))
    );
  }
}
