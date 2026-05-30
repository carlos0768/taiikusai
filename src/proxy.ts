import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeAuthRedirectPath } from "@/lib/authRedirect";

const LOGIN_PATH = "/login";
const PUBLIC_PAGE_PATHS = new Set([LOGIN_PATH]);

function isProjectHighlightPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return (
    segments.length === 3 &&
    segments[0] === "project" &&
    Boolean(segments[1]) &&
    segments[2] === "highlight"
  );
}

function getPracticeHighlightPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "project" || !segments[1]) return null;
  if (segments[2] === "highlight") return null;

  return `/project/${segments[1]}/highlight`;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();

  const isLoginPage = pathname === LOGIN_PATH;
  const isPublicPage =
    PUBLIC_PAGE_PATHS.has(pathname) || isProjectHighlightPath(pathname);

  if (!data?.claims?.sub) {
    if (isPublicPage) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_PATH;
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoginPage) {
    const redirectPath = getSafeAuthRedirectPath(
      request.nextUrl.searchParams.get("next")
    );
    const redirectUrl = new URL(redirectPath, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  const appMetadata = data.claims.app_metadata as
    | { is_practice?: boolean }
    | undefined;

  if (appMetadata?.is_practice === true) {
    const highlightPath = getPracticeHighlightPath(pathname);
    if (highlightPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = highlightPath;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
