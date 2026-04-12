import { createClient } from "@/lib/supabase/client";
import { encodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid } from "@/lib/grid/types";
import type {
  MotionType,
  PanelType,
  WaveMotionData,
  ZentaiGamen,
} from "@/types";

export async function getZentaiGamenByProject(
  projectId: string
): Promise<ZentaiGamen[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("zentai_gamen")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getZentaiGamen(id: string): Promise<ZentaiGamen> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("zentai_gamen")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createZentaiGamen(
  projectId: string,
  gridWidth: number,
  gridHeight: number,
  positionX: number = 0,
  positionY: number = 0,
  name: string = "Untitled",
  gridData?: string,
  panelType: PanelType = "general",
  motionType: MotionType | null = null,
  motionData: WaveMotionData | null = null
): Promise<ZentaiGamen> {
  const supabase = createClient();
  const data = gridData ?? encodeGrid(createEmptyGrid(gridWidth, gridHeight));

  const { data: result, error } = await supabase
    .from("zentai_gamen")
    .insert({
      project_id: projectId,
      name,
      grid_data: data,
      position_x: positionX,
      position_y: positionY,
      panel_type: panelType,
      motion_type: motionType,
      motion_data: motionData,
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function updateZentaiGamen(
  id: string,
  updates: Partial<
    Pick<
      ZentaiGamen,
      | "name"
      | "grid_data"
      | "thumbnail"
      | "position_x"
      | "position_y"
      | "memo"
      | "panel_type"
      | "motion_type"
      | "motion_data"
    >
  >
): Promise<ZentaiGamen> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("zentai_gamen")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteZentaiGamen(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("zentai_gamen")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
