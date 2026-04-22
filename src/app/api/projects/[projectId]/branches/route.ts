import { NextResponse } from "next/server";
import {
  cloneConnectionsToBranch,
  clonePanelsToBranch,
  fetchProjectBranchState,
  getProjectBranchSettings,
} from "@/lib/projectBranchState";
import {
  fetchProjectBranchContext,
  isReservedBranchName,
  sanitizeBranchName,
  toBranchScopedProject,
} from "@/lib/projectBranches";
import { createClient } from "@/lib/supabase/server";

interface CreateBranchRequestBody {
  name: string;
  sourceBranchId: string;
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

  return "ブランチの作成に失敗しました";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  let body: CreateBranchRequestBody;
  try {
    body = (await request.json()) as CreateBranchRequestBody;
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が不正です" },
      { status: 400 }
    );
  }

  const name = sanitizeBranchName(body.name);
  if (!name) {
    return NextResponse.json(
      { error: "ブランチ名を入力してください" },
      { status: 400 }
    );
  }

  if (isReservedBranchName(name)) {
    return NextResponse.json(
      { error: "`main` は予約済みのため使用できません" },
      { status: 400 }
    );
  }

  if (!body.sourceBranchId) {
    return NextResponse.json(
      { error: "コピー元のブランチが必要です" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  let createdBranchId: string | null = null;

  try {
    const { project, branches } = await fetchProjectBranchContext(
      supabase,
      projectId,
      body.sourceBranchId
    );

    if (
      branches.some(
        (branch) => branch.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return NextResponse.json(
        { error: "同名のブランチが既に存在します" },
        { status: 409 }
      );
    }

    const sourceBranch = branches.find((branch) => branch.id === body.sourceBranchId);
    if (!sourceBranch) {
      return NextResponse.json(
        { error: "コピー元のブランチが見つかりません" },
        { status: 404 }
      );
    }

    const sourceState = await fetchProjectBranchState(
      supabase,
      projectId,
      toBranchScopedProject(project, sourceBranch),
      sourceBranch
    );

    const { data: createdBranch, error: createBranchError } = await supabase
      .from("project_branches")
      .insert({
        project_id: projectId,
        name,
        is_main: false,
        source_branch_id: sourceBranch.id,
        ...getProjectBranchSettings(sourceState.project),
      })
      .select("*")
      .single();

    if (createBranchError || !createdBranch) {
      throw createBranchError ?? new Error("ブランチの作成に失敗しました");
    }

    createdBranchId = createdBranch.id;

    const { panels, idMap } = clonePanelsToBranch({
      projectId,
      branchId: createdBranch.id,
      panels: sourceState.panels,
    });
    const connections = cloneConnectionsToBranch({
      projectId,
      branchId: createdBranch.id,
      connections: sourceState.connections,
      panelIdMap: idMap,
    });

    if (panels.length > 0) {
      const { error } = await supabase.from("zentai_gamen").insert(panels);
      if (error) throw error;
    }

    if (connections.length > 0) {
      const { error } = await supabase.from("connections").insert(connections);
      if (error) throw error;
    }

    return NextResponse.json({
      branch: createdBranch,
    });
  } catch (error) {
    if (createdBranchId) {
      await supabase
        .from("project_branches")
        .delete()
        .eq("id", createdBranchId)
        .eq("project_id", projectId);
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
