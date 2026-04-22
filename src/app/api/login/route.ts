import { NextResponse } from "next/server";
import {
  assertLoginId,
  getProfileByLoginId,
  maybeBootstrapAdminForLogin,
} from "@/lib/server/auth";
import { loginIdToAuthEmail, normalizeLoginId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse, HttpError } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const { loginId, password } = await request.json();
    const normalizedLoginId = normalizeLoginId(loginId ?? "");

    assertLoginId(normalizedLoginId);
    if (!password) {
      throw new HttpError(400, "パスワードを入力してください");
    }

    await maybeBootstrapAdminForLogin(normalizedLoginId);

    const profile = await getProfileByLoginId(normalizedLoginId);
    if (!profile) {
      throw new HttpError(401, "ID またはパスワードが正しくありません");
    }
    if (profile.status !== "active") {
      throw new HttpError(403, "このアカウントは無効化されています");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToAuthEmail(normalizedLoginId),
      password,
    });

    if (error) {
      throw new HttpError(401, "ID またはパスワードが正しくありません");
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        loginId: profile.login_id,
        displayName: profile.display_name,
        isAdmin: profile.is_admin,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
