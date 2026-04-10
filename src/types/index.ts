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

export interface ZentaiGamen {
  id: string;
  project_id: string;
  name: string;
  grid_data: string; // base64 encoded
  thumbnail: string | null;
  position_x: number;
  position_y: number;
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
