export interface Profile {
  id: string;
  username?: string | null;
  login_id: string;
  display_name: string;
  is_admin: boolean;
  status: "active" | "disabled";
  created_by: string | null;
  git_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
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

export interface MusicData {
  source_type: "youtube" | "file";
  video_id?: string;
  file_url?: string;
  file_path?: string;
  file_name?: string;
  start_sec: number;
  end_sec: number;
  offset_sec: number;
  duration: number;
}

export interface ProjectBranchSettings {
  grid_width: number;
  grid_height: number;
  colors: string[];
  default_panel_duration_ms: number;
  default_interval_ms: number;
  music_data: MusicData | null;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  grid_width: number;
  grid_height: number;
  colors: string[];
  default_panel_duration_ms: number;
  default_interval_ms: number;
  music_data: MusicData | null;
  main_branch_requires_admin_approval: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectBranch extends ProjectBranchSettings {
  id: string;
  project_id: string;
  name: string;
  is_main: boolean;
  source_branch_id: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchScopedProject extends Project {
  active_branch_id: string;
  active_branch_name: string;
  active_branch_is_main: boolean;
}

export type PanelType = "general" | "motion" | "keep";
export type MotionType = "wave";

export interface WaveMotionData {
  after_grid_data: string;
  before_duration_ms: number;
  after_duration_ms: number;
  speed_columns_per_sec: number;
}

export const DEFAULT_WAVE_MOTION_DATA = (
  afterGridDataBase64: string
): WaveMotionData => ({
  after_grid_data: afterGridDataBase64,
  before_duration_ms: 1000,
  after_duration_ms: 1000,
  speed_columns_per_sec: 8,
});

export interface ZentaiGamen {
  id: string;
  project_id: string;
  branch_id: string;
  name: string;
  grid_data: string;
  thumbnail: string | null;
  position_x: number;
  position_y: number;
  memo: string;
  panel_type: PanelType;
  motion_type: MotionType | null;
  motion_data: WaveMotionData | null;
  panel_duration_override_ms: number | null;
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
  interval_override_ms: number | null;
  keep_mask_grid_data: string | null;
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

export interface ProjectGridResizeHistorySnapshotProject {
  id: string;
  name: string;
  grid_width: number;
  grid_height: number;
  default_panel_duration_ms: number;
  default_interval_ms: number;
  colors?: string[];
  music_data?: MusicData | null;
}

export interface ProjectGridResizeHistorySnapshotPanel {
  id: string;
  name: string;
  grid_data: string;
  position_x: number;
  position_y: number;
  memo: string;
  panel_type: PanelType;
  motion_type: MotionType | null;
  motion_data: WaveMotionData | null;
  panel_duration_override_ms: number | null;
  updated_at: string;
}

export interface ProjectGridResizeHistorySnapshotConnection {
  id: string;
  source_id: string;
  target_id: string;
  sort_order: number;
  interval_override_ms: number | null;
  keep_mask_grid_data: string | null;
}

export interface ProjectGridResizeHistorySnapshot {
  project: ProjectGridResizeHistorySnapshotProject;
  panels: ProjectGridResizeHistorySnapshotPanel[];
  connections?: ProjectGridResizeHistorySnapshotConnection[];
}

export interface RestorableProjectGridResizeHistorySnapshot
  extends ProjectGridResizeHistorySnapshot {
  project: ProjectGridResizeHistorySnapshotProject & {
    colors: string[];
    music_data: MusicData | null;
  };
  connections: ProjectGridResizeHistorySnapshotConnection[];
}

export interface ProjectGridResizeHistory {
  id: string;
  project_id: string;
  branch_id: string;
  from_grid_width: number;
  from_grid_height: number;
  to_grid_width: number;
  to_grid_height: number;
  auto_adjust_illustration: boolean;
  snapshot: ProjectGridResizeHistorySnapshot;
  created_at: string;
}

export type ProjectBranchMergeSnapshot = ProjectGridResizeHistorySnapshot;

export interface ProjectBranchMerge {
  id: string;
  project_id: string;
  source_branch_id: string;
  target_branch_id: string;
  snapshot: ProjectBranchMergeSnapshot;
  created_at: string;
}

export type MergeRequestStatus =
  | "open"
  | "approved"
  | "rejected"
  | "cancelled";

export interface MergeRequest {
  id: string;
  project_id: string;
  source_branch_id: string;
  target_branch_id: string;
  requested_by: string;
  summary: string;
  status: MergeRequestStatus;
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
  project: BranchScopedProject;
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
