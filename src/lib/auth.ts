import type { UserPermissions } from "@/types";

export const DEFAULT_ADMIN_LOGIN_ID = "admin";
export const DEFAULT_ADMIN_DISPLAY_NAME = "admin";
export const DEFAULT_ADMIN_PASSWORD =
  process.env.INITIAL_ADMIN_PASSWORD ?? "taiikusai2026";

export const LOGIN_ID_PATTERN = /^[a-z0-9]+$/;

export type PermissionInput = Pick<
  UserPermissions,
  | "can_view_projects"
  | "can_create_branches"
  | "can_edit_branch_content"
  | "can_request_main_merge"
  | "can_view_git_requests"
  | "can_manage_accounts"
>;

export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string): boolean {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(value));
}

export function loginIdToAuthEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@taiikusai.local`;
}

export function buildPermissionInput(
  input?: Partial<PermissionInput>,
  isAdmin: boolean = false
): PermissionInput {
  const base: PermissionInput = {
    can_view_projects: true,
    can_create_branches: false,
    can_edit_branch_content: false,
    can_request_main_merge: false,
    can_view_git_requests: false,
    can_manage_accounts: false,
  };

  if (isAdmin) {
    return {
      can_view_projects: true,
      can_create_branches: true,
      can_edit_branch_content: true,
      can_request_main_merge: true,
      can_view_git_requests: true,
      can_manage_accounts: true,
    };
  }

  return {
    ...base,
    ...input,
    can_view_projects: input?.can_view_projects ?? true,
  };
}
