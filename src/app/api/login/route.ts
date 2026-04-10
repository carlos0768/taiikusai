import { NextResponse } from "next/server";
import { validateCredentials, getAuthCookieValue, AUTH_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!validateCredentials(username, password)) {
    return NextResponse.json(
      { error: "ユーザー名またはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE, getAuthCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
