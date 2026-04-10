import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "taiikusai_auth";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get(AUTH_COOKIE);
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // Allow API routes through
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Not authenticated -> redirect to login
  if (!authCookie && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated -> redirect away from login
  if (authCookie && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
