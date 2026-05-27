import { NextResponse } from "next/server";
import {
  assertLoginId,
  listProfilesWithPermissions,
  normalizeStatus,
  parsePermissionInput,
  requireAdmin,
  syncPracticeAppMetadata,
} from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginIdToAuthEmail, normalizeLoginId } from "@/lib/auth";
import { toErrorResponse, HttpError } from "@/lib/server/errors";

export async function GET() {
  try {
    await requireAdmin();
    const users = await listProfilesWithPermissions();
    return NextResponse.json({ users });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { profile: actor } = await requireAdmin();
    const { loginId, displayName, password, isAdmin, isPractice, status, permissions, gitNotificationsEnabled } =
      await request.json();

    const normalizedLoginId = normalizeLoginId(loginId ?? "");
    assertLoginId(normalizedLoginId);

    if (!displayName?.trim()) {
      throw new HttpError(400, "表示名を入力してください");
    }
    if (!password || String(password).length < 8) {
      throw new HttpError(400, "パスワードは 8 文字以上で入力してください");
    }

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("profiles")
      .select("id")
      .eq("login_id", normalizedLoginId)
      .maybeSingle<{ id: string }>();

    if (existingError) {
      throw existingError;
    }
    if (existing) {
      throw new HttpError(400, "その ID はすでに使用されています");
    }

    const authEmail = loginIdToAuthEmail(normalizedLoginId);
    const nextIsPractice = Boolean(isPractice);
    const nextIsAdmin = nextIsPractice ? false : Boolean(isAdmin);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        username: normalizedLoginId,
        login_id: normalizedLoginId,
        display_name: String(displayName).trim(),
      },
      app_metadata: {
        is_practice: nextIsPractice,
      },
    });

    if (createError || !created.user) {
      throw new HttpError(400, createError?.message ?? "アカウントを作成できませんでした");
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      username: normalizedLoginId,
      login_id: normalizedLoginId,
      display_name: String(displayName).trim(),
      is_admin: nextIsAdmin,
      is_practice: nextIsPractice,
      status: normalizeStatus(status),
      created_by: actor.id,
      git_notifications_enabled: gitNotificationsEnabled ?? true,
    });

    if (profileError) {
      throw profileError;
    }

    const { error: permissionError } = await admin
      .from("user_permissions")
      .upsert({
        user_id: created.user.id,
        ...parsePermissionInput(
          nextIsPractice ? { can_view_projects: true } : permissions,
          nextIsAdmin
        ),
      });

    if (permissionError) {
      throw permissionError;
    }

    await syncPracticeAppMetadata(created.user.id, nextIsPractice);

    const users = await listProfilesWithPermissions();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    return toErrorResponse(error);
  }
}
