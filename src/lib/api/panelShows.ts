import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import type { PanelShow, ZentaiGamen } from "@/types";

interface PanelShowsResponse {
  panelShows: PanelShow[];
}

export interface PanelShowPublicDetail {
  panelShow: PanelShow;
  panels: ZentaiGamen[];
}

export async function getPanelShowsByProject(
  projectId: string,
  branchId: string
): Promise<PanelShow[]> {
  const { panelShows } = await fetchJson<PanelShowsResponse>(
    `/api/projects/${projectId}/panel-shows/public?branch=${encodeURIComponent(
      branchId
    )}`
  );
  return panelShows;
}

export async function getPanelShowPublicDetail(
  projectId: string,
  branchId: string,
  showId: string
): Promise<PanelShowPublicDetail> {
  return fetchJson<PanelShowPublicDetail>(
    `/api/projects/${projectId}/panel-shows/public?branch=${encodeURIComponent(
      branchId
    )}&showId=${encodeURIComponent(showId)}`
  );
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
