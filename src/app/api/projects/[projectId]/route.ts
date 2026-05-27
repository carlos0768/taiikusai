import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import { getProjectById } from "@/lib/server/pseudoGit";
import type { ProjectBranch, ZentaiGamen } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    if (!profile.permissions.can_view_projects && !profile.is_admin) {
      throw new HttpError(403, "プロジェクト閲覧権限がありません");
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    return NextResponse.json({ project });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    if (!profile.is_admin && !profile.permissions.can_manage_accounts) {
      throw new HttpError(403, "設定変更権限がありません");
    }

    const { projectId } = await params;
    const body = await request.json();
    const admin = createAdminClient();
    const updates: {
      main_branch_requires_admin_approval?: boolean;
      highlight_branch_id?: string | null;
      highlight_start_zentai_gamen_id?: string | null;
    } = {};

    if ("mainBranchRequiresAdminApproval" in body) {
      updates.main_branch_requires_admin_approval =
        body.mainBranchRequiresAdminApproval !== false;
    }

    if ("highlightBranchId" in body || "highlightStartZentaiGamenId" in body) {
      if (!profile.is_admin) {
        throw new HttpError(403, "admin 権限が必要です");
      }

      const highlightBranchId =
        typeof body.highlightBranchId === "string" && body.highlightBranchId
          ? body.highlightBranchId
          : null;
      const highlightStartZentaiGamenId =
        typeof body.highlightStartZentaiGamenId === "string" &&
        body.highlightStartZentaiGamenId
          ? body.highlightStartZentaiGamenId
          : null;

      if (Boolean(highlightBranchId) !== Boolean(highlightStartZentaiGamenId)) {
        throw new HttpError(400, "表示するブランチとパネル列を選択してください");
      }

      if (highlightBranchId && highlightStartZentaiGamenId) {
        const [{ data: branch, error: branchError }, { data: startNode, error: nodeError }] =
          await Promise.all([
            admin
              .from("project_branches")
              .select("*")
              .eq("id", highlightBranchId)
              .eq("project_id", projectId)
              .maybeSingle<ProjectBranch>(),
            admin
              .from("zentai_gamen")
              .select("*")
              .eq("id", highlightStartZentaiGamenId)
              .eq("project_id", projectId)
              .maybeSingle<ZentaiGamen>(),
          ]);

        if (branchError || nodeError) {
          throw new HttpError(
            400,
            branchError?.message ?? nodeError?.message ?? "表示設定を確認できませんでした"
          );
        }

        if (!branch || !startNode || startNode.branch_id !== branch.id) {
          throw new HttpError(400, "表示するパネル列がブランチ内にありません");
        }
      }

      updates.highlight_branch_id = highlightBranchId;
      updates.highlight_start_zentai_gamen_id = highlightStartZentaiGamenId;
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, "更新する設定がありません");
    }

    const { data, error } = await admin
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select("*")
      .single();

    if (error || !data) {
      throw new HttpError(400, error?.message ?? "設定を更新できませんでした");
    }

    return NextResponse.json({ success: true, project: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
