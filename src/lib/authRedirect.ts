export const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";

const REDIRECT_BASE_URL = "http://taiikusai.local";

export function getSafeAuthRedirectPath(
  value?: string | string[] | null
): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return DEFAULT_AUTH_REDIRECT_PATH;

  const candidate = rawValue.trim();
  if (!candidate.startsWith("/")) return DEFAULT_AUTH_REDIRECT_PATH;

  try {
    const url = new URL(candidate, REDIRECT_BASE_URL);
    if (url.origin !== REDIRECT_BASE_URL) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }
    if (url.pathname === "/login") {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}
