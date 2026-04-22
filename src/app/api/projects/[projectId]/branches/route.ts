import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, requirePermission } from "@/lib/server/auth";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import {
  cloneBranchFromSource,
  getBranchContext,
  normalizeBranchName,
  resolveBranch,
} from "@/lib/server/pseudoGit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { profile } = await requireAuth();
    if (!profile.is_admin && !profile.permissions.can_view_projects) {
      throw new HttpError(403, "プロジェクト閲覧権限がありません");
    }

    const branchName = request.nextUrl.searchParams.get("branch") ?? undefined;
    const context = await getBranchContext(projectId, branchName, profile);
    return NextResponse.json(context);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { profile } = await requireAuth();
    requirePermission(profile, "can_create_branches");

    const { name, sourceBranchName } = await request.json();
    if (!name?.trim()) {
      throw new HttpError(400, "ブランチ名を入力してください");
    }

    const sourceBranch = await resolveBranch(
      projectId,
      normalizeBranchName(sourceBranchName ?? "main")
    );

    const branch = await cloneBranchFromSource({
      projectId,
      branchName: String(name),
      sourceBranchId: sourceBranch.id,
      createdBy: profile.id,
    });

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    return toErrorResponse(error);
  }
}
