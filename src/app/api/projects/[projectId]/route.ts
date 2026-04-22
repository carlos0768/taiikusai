import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import { getProjectById } from "@/lib/server/pseudoGit";

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
    const { mainBranchRequiresAdminApproval } = await request.json();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("projects")
      .update({
        main_branch_requires_admin_approval:
          mainBranchRequiresAdminApproval !== false,
      })
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
