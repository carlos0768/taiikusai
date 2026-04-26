import type {
  BranchScopedProject,
  Project,
  ProjectBranch,
  ProjectBranchSettings,
} from "@/types";

type SupabaseLike = {
  from: (table: string) => unknown;
};

export function sortProjectBranches(branches: ProjectBranch[]): ProjectBranch[] {
  return [...branches].sort((a, b) => {
    if (a.is_main !== b.is_main) {
      return a.is_main ? -1 : 1;
    }

    return a.created_at.localeCompare(b.created_at);
  });
}

export function getMainProjectBranch(
  branches: ProjectBranch[]
): ProjectBranch | null {
  return branches.find((branch) => branch.is_main) ?? null;
}

export function resolveProjectBranch(
  branches: ProjectBranch[],
  requestedBranchId: string | null
): ProjectBranch | null {
  if (requestedBranchId) {
    const requested = branches.find((branch) => branch.id === requestedBranchId);
    if (requested) return requested;
  }

  return getMainProjectBranch(branches);
}

export function toBranchScopedProject(
  project: Project,
  branch: ProjectBranch
): BranchScopedProject {
  return {
    ...project,
    grid_width: branch.grid_width,
    grid_height: branch.grid_height,
    colors: [...branch.colors],
    default_panel_duration_ms: branch.default_panel_duration_ms,
    default_interval_ms: branch.default_interval_ms,
    music_data: branch.music_data,
    updated_at: branch.updated_at,
    active_branch_id: branch.id,
    active_branch_name: branch.name,
    active_branch_is_main: branch.is_main,
  };
}

export function sanitizeBranchName(name: string): string {
  return name.trim();
}

export function isReservedBranchName(name: string): boolean {
  return sanitizeBranchName(name).toLowerCase() === "main";
}

export function buildBranchPath(
  path: string,
  branchId: string,
  extraSearchParams?: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  if (branchId) {
    params.set("branch", branchId);
  }

  if (extraSearchParams) {
    for (const [key, value] of Object.entries(extraSearchParams)) {
      if (value === null || value === undefined || value === "") continue;
      params.set(key, value);
    }
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export async function fetchProjectBranchContext(
  supabase: SupabaseLike,
  projectId: string,
  requestedBranchId: string | null
): Promise<{
  project: Project;
  projectView: BranchScopedProject;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  mainBranch: ProjectBranch;
}> {
  const [
    { data: project, error: projectError },
    { data: branches, error: branchesError },
  ] = (await Promise.all([
    (
      supabase.from("projects") as {
        select: (query: string) => {
          eq: (column: string, value: string) => {
            single: () => Promise<{ data: Project | null; error: unknown }>;
          };
        };
      }
    )
      .select("*")
      .eq("id", projectId)
      .single(),
    (
      supabase.from("project_branches") as {
        select: (query: string) => {
          eq: (column: string, value: string) => {
            order: (
              column: string,
              options?: { ascending?: boolean }
            ) => Promise<{ data: ProjectBranch[] | null; error: unknown }>;
          };
        };
      }
    )
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ])) as [
    { data: Project | null; error: unknown },
    { data: ProjectBranch[] | null; error: unknown },
  ];

  if (projectError || !project) {
    throw projectError ?? new Error("プロジェクトが見つかりません");
  }

  if (branchesError) {
    throw branchesError;
  }

  const sortedBranches = sortProjectBranches(branches ?? []);
  const mainBranch = getMainProjectBranch(sortedBranches);
  if (!mainBranch) {
    throw new Error("main ブランチが見つかりません");
  }

  const currentBranch =
    resolveProjectBranch(sortedBranches, requestedBranchId) ?? mainBranch;

  return {
    project,
    branches: sortedBranches,
    currentBranch,
    mainBranch,
    projectView: toBranchScopedProject(project, currentBranch),
  };
}

export async function syncMainProjectCache(
  supabase: SupabaseLike,
  projectId: string,
  settings: ProjectBranchSettings
): Promise<Project> {
  const now = new Date().toISOString();
  const { data, error } = await (
    supabase.from("projects") as {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (query: string) => {
            single: () => Promise<{ data: Project | null; error: unknown }>;
          };
        };
      };
    }
  )
    .update({
      grid_width: settings.grid_width,
      grid_height: settings.grid_height,
      colors: settings.colors,
      default_panel_duration_ms: settings.default_panel_duration_ms,
      default_interval_ms: settings.default_interval_ms,
      music_data: settings.music_data,
      updated_at: now,
    })
    .eq("id", projectId)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("main キャッシュの同期に失敗しました");
  }

  return data;
}
