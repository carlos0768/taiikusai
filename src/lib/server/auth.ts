import type { User } from "@supabase/supabase-js";
import {
  buildPermissionInput,
  DEFAULT_ADMIN_DISPLAY_NAME,
  DEFAULT_ADMIN_LOGIN_ID,
  DEFAULT_ADMIN_PASSWORD,
  isValidLoginId,
  loginIdToAuthEmail,
  normalizeLoginId,
  type PermissionInput,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AuthProfile, Profile, UserPermissions } from "@/types";
import { HttpError } from "./errors";

interface ProfileRecord extends Profile {
  permissions?: UserPermissions | UserPermissions[] | null;
}

export interface AuthContext {
  user: Pick<User, "id">;
  profile: AuthProfile;
  isAdmin: boolean;
}

export async function ensureSeedAdminAccount() {
  const admin = createAdminClient();
  const loginId = DEFAULT_ADMIN_LOGIN_ID;
  const authEmail = loginIdToAuthEmail(loginId);

  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("login_id", loginId)
    .maybeSingle<Profile>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  let userId = existingProfile?.id;
  if (!userId) {
    const authUser = await findAuthUserByEmail(authEmail);
    if (authUser) {
      userId = authUser.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: authEmail,
        password: DEFAULT_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
          login_id: loginId,
          display_name: DEFAULT_ADMIN_DISPLAY_NAME,
        },
      });

      if (error || !data.user) {
        throw new Error(error?.message ?? "Failed to create default admin");
      }

      userId = data.user.id;
    }
  }

  const { error: upsertProfileError } = await admin.from("profiles").upsert({
    id: userId,
    ...buildProfileIdentityFields(loginId),
    display_name: DEFAULT_ADMIN_DISPLAY_NAME,
    is_admin: true,
    status: "active",
    git_notifications_enabled: true,
  });

  if (upsertProfileError) {
    throw new Error(upsertProfileError.message);
  }

  const { error: permissionsError } = await admin
    .from("user_permissions")
    .upsert({
      user_id: userId,
      ...buildPermissionInput(undefined, true),
    });

  if (permissionsError) {
    throw new Error(permissionsError.message);
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data,
    error,
  } = await supabase.auth.getClaims();

  if (error) {
    throw new HttpError(401, error.message);
  }

  const userId = data?.claims?.sub;
  if (!userId) {
    throw new HttpError(401, "認証が必要です");
  }

  const profile = await getProfileWithPermissions(userId);
  if (!profile) {
    throw new HttpError(403, "ユーザー情報が見つかりません");
  }

  if (profile.status !== "active") {
    throw new HttpError(403, "このアカウントは無効化されています");
  }

  const hydratedProfile = hydrateAuthProfile(profile);

  return {
    user: { id: userId },
    profile: hydratedProfile,
    isAdmin: hydratedProfile.is_admin,
  };
}

export async function requireAdmin(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.isAdmin && !context.profile.permissions.can_manage_accounts) {
    throw new HttpError(403, "管理者権限が必要です");
  }
  return context;
}

export function requirePermission(
  profile: AuthProfile,
  permission: keyof PermissionInput
) {
  if (profile.is_admin) return;
  if (!profile.permissions[permission]) {
    throw new HttpError(403, "権限がありません");
  }
}

export function parsePermissionInput(
  input?: Partial<PermissionInput>,
  isAdmin: boolean = false
): PermissionInput {
  return buildPermissionInput(input, isAdmin);
}

export function assertLoginId(input: string) {
  if (!isValidLoginId(input)) {
    throw new HttpError(
      400,
      "ID は英数字小文字のみで入力してください"
    );
  }
}

export function normalizeStatus(input?: string): "active" | "disabled" {
  return input === "disabled" ? "disabled" : "active";
}

export function buildProfileIdentityFields(loginId: string) {
  const normalized = normalizeLoginId(loginId);
  return {
    login_id: normalized,
    username: normalized,
  };
}

export function buildPermissionRecord(userId: string, isAdmin: boolean = false) {
  return {
    user_id: userId,
    ...buildPermissionInput(undefined, isAdmin),
  };
}

export function hydrateAuthProfile(profile: ProfileRecord): AuthProfile {
  return {
    ...profile,
    permissions: coercePermissionRecord(profile.id, profile.permissions, profile.is_admin),
  };
}

export async function ensureRemainingAdmin(userId: string) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("is_admin", true)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) <= 1) {
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("is_admin, status")
      .eq("id", userId)
      .single<{ is_admin: boolean; status: string }>();

    if (targetError) {
      throw new Error(targetError.message);
    }

    if (target.is_admin && target.status === "active") {
      throw new HttpError(400, "最後の管理者は変更できません");
    }
  }
}

export async function maybeBootstrapAdminForLogin(loginId: string) {
  if (normalizeLoginId(loginId) === DEFAULT_ADMIN_LOGIN_ID) {
    await ensureSeedAdminAccount();
  }
}

export async function getProfileByLoginId(loginId: string) {
  const admin = createAdminClient();
  const normalized = normalizeLoginId(loginId);
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("login_id", normalized)
    .maybeSingle<Profile>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getProfileWithPermissions(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*, permissions:user_permissions(*)")
    .eq("id", userId)
    .maybeSingle<ProfileRecord>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  return data;
}

export async function listProfilesWithPermissions() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*, permissions:user_permissions(*)")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ProfileRecord[]).map(hydrateAuthProfile);
}

export async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    const matched = data.users.find((user) => user.email === email);
    if (matched) return matched;

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

function coercePermissionRecord(
  userId: string,
  permissions: ProfileRecord["permissions"],
  isAdmin: boolean
): UserPermissions {
  const permissionValue = Array.isArray(permissions)
    ? permissions[0]
    : permissions;

  return {
    ...buildPermissionRecord(userId, isAdmin),
    ...(permissionValue ?? {}),
  };
}
