import { NextResponse } from "next/server";
import {
  ensureRemainingAdmin,
  listProfilesWithPermissions,
  normalizeStatus,
  parsePermissionInput,
  requireAdmin,
} from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorResponse, HttpError } from "@/lib/server/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const { profile: actor } = await requireAdmin();
    const admin = createAdminClient();
    const body = await request.json();

    const { data: existing, error: existingError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (existingError || !existing) {
      throw new HttpError(404, "対象ユーザーが見つかりません");
    }

    const nextIsAdmin =
      typeof body.isAdmin === "boolean" ? body.isAdmin : existing.is_admin;
    const nextStatus =
      typeof body.status === "string" ? normalizeStatus(body.status) : existing.status;

    if ((existing.is_admin && !nextIsAdmin) || (existing.is_admin && nextStatus === "disabled")) {
      await ensureRemainingAdmin(userId);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        display_name:
          typeof body.displayName === "string" && body.displayName.trim()
            ? body.displayName.trim()
            : existing.display_name,
        is_admin: nextIsAdmin,
        status: nextStatus,
        git_notifications_enabled:
          typeof body.gitNotificationsEnabled === "boolean"
            ? body.gitNotificationsEnabled
            : existing.git_notifications_enabled,
        created_by: existing.created_by ?? actor.id,
      })
      .eq("id", userId);

    if (profileError) {
      throw profileError;
    }

    const { error: permissionError } = await admin
      .from("user_permissions")
      .upsert({
        user_id: userId,
        ...parsePermissionInput(body.permissions, nextIsAdmin),
      });

    if (permissionError) {
      throw permissionError;
    }

    const users = await listProfilesWithPermissions();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    return toErrorResponse(error);
  }
}
