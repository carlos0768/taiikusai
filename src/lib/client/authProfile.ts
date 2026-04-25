import type { AuthProfile, ProjectBranch } from "@/types";

export const READONLY_AUTH_PROFILE: AuthProfile = {
  id: "__pending_auth__",
  username: "__pending_auth__",
  login_id: "",
  display_name: "",
  is_admin: false,
  status: "active",
  created_by: null,
  git_notifications_enabled: false,
  created_at: "",
  updated_at: "",
  permissions: {
    user_id: "__pending_auth__",
    can_view_projects: true,
    can_create_branches: false,
    can_edit_branch_content: false,
    can_request_main_merge: false,
    can_view_git_requests: false,
    can_manage_accounts: false,
  },
};

export function canEditBranch(
  profile: AuthProfile | null,
  branch: ProjectBranch | null
): boolean {
  if (!profile || !branch) return false;
  if (profile.is_admin) return true;
  if (branch.is_main) return false;
  return (
    branch.created_by === profile.id &&
    (profile.permissions.can_edit_branch_content ||
      profile.permissions.can_create_branches)
  );
}

export function canCreateBranches(profile: AuthProfile | null): boolean {
  return Boolean(profile?.is_admin || profile?.permissions.can_create_branches);
}

export function canRequestMerge(
  profile: AuthProfile | null,
  branch: ProjectBranch | null
): boolean {
  if (!profile || !branch || branch.is_main) return false;
  return Boolean(
    profile.is_admin ||
      (profile.permissions.can_request_main_merge &&
        branch.created_by === profile.id)
  );
}
