import type { AuthProfile } from "@/types";

export const PUBLIC_CLIENT_ONLY_USER_ID = "__public_client_only__";

export const PUBLIC_CLIENT_ONLY_AUTH_PROFILE: AuthProfile = {
  id: PUBLIC_CLIENT_ONLY_USER_ID,
  username: PUBLIC_CLIENT_ONLY_USER_ID,
  login_id: "public",
  display_name: "公開編集",
  is_admin: false,
  is_practice: false,
  status: "active",
  created_by: null,
  git_notifications_enabled: false,
  created_at: "",
  updated_at: "",
  permissions: {
    user_id: PUBLIC_CLIENT_ONLY_USER_ID,
    can_view_projects: true,
    can_create_branches: false,
    can_edit_branch_content: true,
    can_request_main_merge: true,
    can_view_git_requests: true,
    can_manage_accounts: false,
  },
};

export function isClientOnlyAuthProfile(profile: AuthProfile | null) {
  return profile?.id === PUBLIC_CLIENT_ONLY_USER_ID;
}
