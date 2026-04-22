export interface Profile {
  id: string;
  username?: string;
  login_id: string;
  display_name: string;
  is_admin: boolean;
  status: "active" | "disabled";
  created_by: string | null;
  git_notifications_enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface UserPermissions {
  user_id: string;
  can_view_projects: boolean;
  can_create_branches: boolean;
  can_edit_branch_content: boolean;
  can_request_main_merge: boolean;
  can_view_git_requests: boolean;
  can_manage_accounts: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthProfile extends Profile {
  permissions: UserPermissions;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  grid_width: number;
  grid_height: number;
  colors: string[];
  main_branch_requires_admin_approval: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZentaiGamen {
  id: string;
  project_id: string;
  branch_id: string;
  name: string;
  grid_data: string; // base64 encoded
  thumbnail: string | null;
  position_x: number;
  position_y: number;
  memo: string;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  project_id: string;
  branch_id: string;
  source_id: string;
  target_id: string;
  sort_order: number;
  created_at: string;
}

export interface Template {
  id: string;
  owner_id: string;
  name: string;
  grid_data: string;
  grid_width: number;
  grid_height: number;
  thumbnail: string | null;
  tags: string[];
  created_at: string;
}

export interface ProjectBranch {
  id: string;
  project_id: string;
  name: string;
  is_main: boolean;
  source_branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MergeRequest {
  id: string;
  project_id: string;
  source_branch_id: string;
  target_branch_id: string;
  requested_by: string;
  summary: string;
  status: "open" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface GitNotificationSummary {
  unreadCount: number;
  hasUnread: boolean;
}

export interface BranchContextResponse {
  project: Project;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  auth: AuthProfile;
  canEditCurrentBranch: boolean;
  canCreateBranches: boolean;
  canRequestMerge: boolean;
  canViewGitRequests: boolean;
  unreadGitNotifications: number;
}

export interface MergeRequestListItem extends MergeRequest {
  source_branch_name: string;
  target_branch_name: string;
  requested_by_display_name: string;
  reviewed_by_display_name: string | null;
}
