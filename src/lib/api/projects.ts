import { createClient } from "@/lib/supabase/client";
import type {
  MusicData,
  Project,
  ProjectBranch,
  ProjectBranchSettings,
} from "@/types";

export async function getProjects(): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createProject(
  name: string,
  gridWidth: number = 50,
  gridHeight: number = 30
): Promise<Project> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      grid_width: gridWidth,
      grid_height: gridHeight,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProject(
  id: string,
  updates: Partial<
    Pick<
      Project,
      | "name"
      | "grid_width"
      | "grid_height"
      | "default_panel_duration_ms"
      | "default_interval_ms"
    >
  >
): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProjectMusic(
  projectId: string,
  branchId: string,
  isMainBranch: boolean,
  musicData: MusicData | null
): Promise<ProjectBranch> {
  return updateProjectBranchSettings(
    projectId,
    branchId,
    { music_data: musicData },
    isMainBranch
  );
}

export async function updateProjectBranchSettings(
  projectId: string,
  branchId: string,
  updates: Partial<ProjectBranchSettings>,
  syncMainCache: boolean
): Promise<ProjectBranch> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data: updatedBranch, error: branchError } = await supabase
    .from("project_branches")
    .update({
      ...updates,
      updated_at: now,
    })
    .eq("id", branchId)
    .eq("project_id", projectId)
    .select("*")
    .single();

  if (branchError || !updatedBranch) {
    throw branchError ?? new Error("Failed to update project branch");
  }

  if (syncMainCache) {
    const { error: projectError } = await supabase
      .from("projects")
      .update({
        ...updates,
        updated_at: now,
      })
      .eq("id", projectId);

    if (projectError) throw projectError;
  }

  return updatedBranch;
}

export async function syncProjectMainBranch(
  projectId: string,
  branch: Pick<ProjectBranch, keyof ProjectBranchSettings>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      grid_width: branch.grid_width,
      grid_height: branch.grid_height,
      colors: branch.colors,
      default_panel_duration_ms: branch.default_panel_duration_ms,
      default_interval_ms: branch.default_interval_ms,
      music_data: branch.music_data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) throw error;
}
