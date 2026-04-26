import { buildResizeHistorySnapshot } from "@/lib/resizeHistory";
import { syncMainProjectCache } from "@/lib/projectBranches";
import type {
  BranchScopedProject,
  Connection,
  ProjectBranch,
  ProjectBranchMergeSnapshot,
  ProjectBranchSettings,
  ZentaiGamen,
} from "@/types";

type SupabaseLike = {
  from: (table: string) => unknown;
};

export interface ProjectBranchState {
  project: BranchScopedProject;
  branch: ProjectBranch;
  panels: ZentaiGamen[];
  connections: Connection[];
}

export function getProjectBranchSettings(
  project: Pick<
    BranchScopedProject,
    | "grid_width"
    | "grid_height"
    | "colors"
    | "default_panel_duration_ms"
    | "default_interval_ms"
    | "music_data"
  >
): ProjectBranchSettings {
  return {
    grid_width: project.grid_width,
    grid_height: project.grid_height,
    colors: [...project.colors],
    default_panel_duration_ms: project.default_panel_duration_ms,
    default_interval_ms: project.default_interval_ms,
    music_data: project.music_data,
  };
}

export async function fetchBranchPanels(
  supabase: SupabaseLike,
  projectId: string,
  branchId: string
): Promise<ZentaiGamen[]> {
  const { data, error } = await (
    supabase.from("zentai_gamen") as {
      select: (query: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (
              column: string,
              options?: { ascending?: boolean }
            ) => Promise<{ data: ZentaiGamen[] | null; error: unknown }>;
          };
        };
      };
    }
  )
    .select("*")
    .eq("project_id", projectId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchBranchConnections(
  supabase: SupabaseLike,
  projectId: string,
  branchId: string
): Promise<Connection[]> {
  const { data, error } = await (
    supabase.from("connections") as {
      select: (query: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (
              column: string,
              options?: { ascending?: boolean }
            ) => Promise<{ data: Connection[] | null; error: unknown }>;
          };
        };
      };
    }
  )
    .select("*")
    .eq("project_id", projectId)
    .eq("branch_id", branchId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchProjectBranchState(
  supabase: SupabaseLike,
  projectId: string,
  project: BranchScopedProject,
  branch: ProjectBranch
): Promise<ProjectBranchState> {
  const [panels, connections] = await Promise.all([
    fetchBranchPanels(supabase, projectId, branch.id),
    fetchBranchConnections(supabase, projectId, branch.id),
  ]);

  return {
    branch,
    project,
    panels,
    connections,
  };
}

export function buildBranchStateSnapshot(
  state: Pick<ProjectBranchState, "project" | "panels" | "connections">
): ProjectBranchMergeSnapshot {
  return buildResizeHistorySnapshot(
    state.project,
    state.panels,
    state.connections
  );
}

export function clonePanelsToBranch(params: {
  projectId: string;
  branchId: string;
  panels: ZentaiGamen[];
  preserveIds?: boolean;
}): {
  panels: ZentaiGamen[];
  idMap: Map<string, string>;
} {
  const { projectId, branchId, panels, preserveIds = false } = params;
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();

  const clonedPanels = panels.map((panel) => {
    const nextId = preserveIds ? panel.id : crypto.randomUUID();
    idMap.set(panel.id, nextId);

    return {
      ...panel,
      id: nextId,
      project_id: projectId,
      branch_id: branchId,
      thumbnail: panel.thumbnail ?? null,
      created_at: now,
      updated_at: now,
    };
  });

  return {
    panels: clonedPanels,
    idMap,
  };
}

export function cloneConnectionsToBranch(params: {
  projectId: string;
  branchId: string;
  connections: Connection[];
  panelIdMap: Map<string, string>;
  preserveIds?: boolean;
}): Connection[] {
  const {
    projectId,
    branchId,
    connections,
    panelIdMap,
    preserveIds = false,
  } = params;
  const now = new Date().toISOString();

  return connections.map((connection) => ({
    ...connection,
    id: preserveIds ? connection.id : crypto.randomUUID(),
    project_id: projectId,
    branch_id: branchId,
    source_id: panelIdMap.get(connection.source_id) ?? connection.source_id,
    target_id: panelIdMap.get(connection.target_id) ?? connection.target_id,
    created_at: now,
  }));
}

export async function replaceBranchState(
  supabase: SupabaseLike,
  params: {
    projectId: string;
    targetBranch: ProjectBranch;
    settings: ProjectBranchSettings;
    panels: ZentaiGamen[];
    connections: Connection[];
    syncMainCache?: boolean;
  }
): Promise<ProjectBranch> {
  const { projectId, targetBranch, settings, panels, connections } = params;
  const syncMainCache = params.syncMainCache ?? targetBranch.is_main;
  const now = new Date().toISOString();

  const deleteConnectionsResult = await (
    supabase.from("connections") as {
      delete: () => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .delete()
    .eq("project_id", projectId)
    .eq("branch_id", targetBranch.id);

  if (deleteConnectionsResult.error) {
    throw deleteConnectionsResult.error;
  }

  const deletePanelsResult = await (
    supabase.from("zentai_gamen") as {
      delete: () => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .delete()
    .eq("project_id", projectId)
    .eq("branch_id", targetBranch.id);

  if (deletePanelsResult.error) {
    throw deletePanelsResult.error;
  }

  if (panels.length > 0) {
    const { error } = await (
      supabase.from("zentai_gamen") as {
        insert: (rows: ZentaiGamen[]) => Promise<{ error: unknown }>;
      }
    ).insert(panels);

    if (error) throw error;
  }

  if (connections.length > 0) {
    const { error } = await (
      supabase.from("connections") as {
        insert: (rows: Connection[]) => Promise<{ error: unknown }>;
      }
    ).insert(connections);

    if (error) throw error;
  }

  const { data: updatedBranch, error: updateBranchError } = await (
    supabase.from("project_branches") as {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (query: string) => {
            single: () => Promise<{
              data: ProjectBranch | null;
              error: unknown;
            }>;
          };
        };
      };
    }
  )
    .update({
      ...settings,
      updated_at: now,
    })
    .eq("id", targetBranch.id)
    .select("*")
    .single();

  if (updateBranchError || !updatedBranch) {
    throw updateBranchError ?? new Error("ブランチ更新に失敗しました");
  }

  if (syncMainCache) {
    await syncMainProjectCache(supabase, projectId, settings);
  }

  return updatedBranch;
}
