import { NextResponse } from "next/server";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
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

  return "ブランチの削除に失敗しました";
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; branchId: string }> }
) {
  const { projectId, branchId } = await context.params;
  const supabase = await createClient();

  try {
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
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
