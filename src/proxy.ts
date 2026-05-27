import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PAGE_PATHS = new Set(["/login"]);
const PUBLIC_API_PATHS = new Set(["/api/login", "/api/logout"]);

function getPracticeHighlightPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "project" || !segments[1]) return null;
  if (segments[2] === "highlight") return null;

  return `/project/${segments[1]}/highlight`;
}

export async function proxy(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);
  const isPublicApi = PUBLIC_API_PATHS.has(pathname);

  if (!user) {
    if (isPublicPage || isPublicApi || isApiRoute) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublicPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  if (!isApiRoute && user?.app_metadata?.is_practice === true) {
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
