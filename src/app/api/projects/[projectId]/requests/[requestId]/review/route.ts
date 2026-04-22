import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import { reviewMergeRequest } from "@/lib/server/pseudoGit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; requestId: string }> }
) {
  try {
    const { profile } = await requireAuth();
    if (!profile.is_admin) {
      throw new HttpError(403, "レビュー権限がありません");
    }

    const { requestId } = await params;
    const { approve } = await request.json();
    const status = await reviewMergeRequest({
      requestId,
      reviewerId: profile.id,
      approve: Boolean(approve),
    });

    return NextResponse.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
