// Simple cookie-based auth with fixed credentials
// TODO: Replace with proper Supabase auth once email confirmation is configured

const FIXED_USERNAME = "admin";
const FIXED_PASSWORD = "taiikusai2026";
const AUTH_COOKIE = "taiikusai_auth";

export function validateCredentials(username: string, password: string): boolean {
  return username === FIXED_USERNAME && password === FIXED_PASSWORD;
}

export function getAuthCookieValue(): string {
  return btoa(`${FIXED_USERNAME}:authenticated`);
}

export function isValidAuthCookie(value: string): boolean {
  try {
    return atob(value) === `${FIXED_USERNAME}:authenticated`;
  } catch {
    return false;
  }
}

export { AUTH_COOKIE };
