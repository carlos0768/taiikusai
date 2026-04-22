export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface MusicData {
  source_type: "youtube" | "file";
  // youtube
  video_id?: string;
  // file (uploaded to storage bucket project-audio)
  file_url?: string; // 再生に使う公開 URL
  file_path?: string; // storage object key (削除用)
  file_name?: string; // 表示用
  // 共通
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
  created_at: string;
  updated_at: string;
}

export interface ProjectBranch extends ProjectBranchSettings {
  id: string;
  project_id: string;
  name: string;
  is_main: boolean;
  source_branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchScopedProject extends Project {
  active_branch_id: string;
  active_branch_name: string;
  active_branch_is_main: boolean;
}

export type PanelType = "general" | "motion" | "keep";
export type MotionType = "wave"; // 将来 'fade' 'sweep' 等を追加可能

export interface WaveMotionData {
  after_grid_data: string; // base64 encoded GridData (適用後)
  before_duration_ms: number; // 素地を表示する時間
  after_duration_ms: number; // 適用後を表示する時間
  speed_columns_per_sec: number; // 何列/秒で伝播するか
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
  grid_data: string; // base64 encoded (motion パネルでは "before/素地" を保持)
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
