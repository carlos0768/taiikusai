import { createClient } from "@/lib/supabase/client";
import type { PanelShow } from "@/types";

export async function getPanelShowsByProject(
  projectId: string,
  branchId: string
): Promise<PanelShow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("panel_shows")
    .select("*")
    .eq("project_id", projectId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PanelShow[];
}

export async function getPanelShow(id: string): Promise<PanelShow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("panel_shows")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as PanelShow;
}

export async function updatePanelShow(
  id: string,
  branchId: string,
  updates: Partial<Pick<PanelShow, "name" | "rows" | "cols" | "placements">>
): Promise<PanelShow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("panel_shows")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("branch_id", branchId)
    .select()
    .single();

  if (error) throw error;
  return data as PanelShow;
}

export async function deletePanelShow(
  id: string,
  branchId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("panel_shows")
    .delete()
    .eq("id", id)
    .eq("branch_id", branchId);

  if (error) throw error;
}
