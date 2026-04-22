import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { toErrorResponse } from "@/lib/server/errors";
import {
  countUnreadGitNotifications,
  markGitNotificationsAsRead,
} from "@/lib/server/pseudoGit";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireAuth();
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const unreadCount = await countUnreadGitNotifications(profile.id, projectId);
    return NextResponse.json({
      unreadCount,
      hasUnread: unreadCount > 0,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { profile } = await requireAuth();
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    await markGitNotificationsAsRead(profile.id, projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
