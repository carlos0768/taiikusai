import { NextResponse } from "next/server";
import {
  requireAuth,
  requirePermission,
} from "@/lib/server/auth";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import {
  createMergeRequest,
  listMergeRequests,
  resolveBranch,
} from "@/lib/server/pseudoGit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    const { projectId } = await params;
    const requests = await listMergeRequests(projectId, profile.id, profile.is_admin);
    return NextResponse.json({ requests });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    requirePermission(profile, "can_request_main_merge");

    const { projectId } = await params;
    const { branchName, summary } = await request.json();
    const sourceBranch = await resolveBranch(projectId, branchName);

    if (sourceBranch.is_main) {
      throw new HttpError(400, "main からの申請は作成できません");
    }

    const targetBranch = await resolveBranch(projectId, "main");
    const requestRow = await createMergeRequest({
      projectId,
      sourceBranchId: sourceBranch.id,
      targetBranchId: targetBranch.id,
      requestedBy: profile.id,
      summary: String(summary ?? ""),
      requesterDisplayName: profile.display_name,
      sourceBranchName: sourceBranch.name,
    });

    return NextResponse.json({ success: true, request: requestRow });
  } catch (error) {
    return toErrorResponse(error);
  }
}
