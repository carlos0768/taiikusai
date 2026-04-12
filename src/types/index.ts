export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  grid_width: number;
  grid_height: number;
  colors: string[];
  created_at: string;
  updated_at: string;
}

export type PanelType = "general" | "motion";
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
  name: string;
  grid_data: string; // base64 encoded (motion パネルでは "before/素地" を保持)
  thumbnail: string | null;
  position_x: number;
  position_y: number;
  memo: string;
  panel_type: PanelType;
  motion_type: MotionType | null;
  motion_data: WaveMotionData | null;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  project_id: string;
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
