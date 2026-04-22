import { NextResponse } from "next/server";
import {
  buildResizeHistorySnapshot,
  isRestorableResizeHistorySnapshot,
} from "@/lib/resizeHistory";
import { createClient } from "@/lib/supabase/server";
import type {
  Connection,
  Project,
  ProjectGridResizeHistory,
  ProjectGridResizeHistorySnapshotPanel,
  ZentaiGamen,
} from "@/types";

interface ProjectState {
  project: Project;
  panels: ZentaiGamen[];
  connections: Connection[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "履歴の復元に失敗しました";
}

async function fetchProjectState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<ProjectState> {
  const [
    { data: project, error: projectError },
    { data: panels, error: panelsError },
    { data: connections, error: connectionsError },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("zentai_gamen")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("connections")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
  ]);

  if (projectError || !project) {
    throw projectError ?? new Error("Project state not found");
  }

  if (panelsError) {
    throw panelsError;
  }

  if (connectionsError) {
    throw connectionsError;
  }

  return {
    project,
    panels: panels ?? [],
    connections: connections ?? [],
  };
}

async function createRollbackHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    projectId: string;
    currentState: ProjectState;
    targetWidth: number;
    targetHeight: number;
  }
): Promise<string> {
  const { projectId, currentState, targetWidth, targetHeight } = params;
  const snapshot = buildResizeHistorySnapshot(
    currentState.project,
    currentState.panels,
    currentState.connections
  );

  const { data, error } = await supabase
    .from("project_grid_resize_history")
    .insert({
      project_id: projectId,
      from_grid_width: currentState.project.grid_width,
      from_grid_height: currentState.project.grid_height,
      to_grid_width: targetWidth,
      to_grid_height: targetHeight,
      auto_adjust_illustration: false,
      snapshot,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Rollback history insert failed");
  }

  return data.id;
}

async function applyPanels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  currentPanels: ZentaiGamen[],
  targetPanels: ProjectGridResizeHistorySnapshotPanel[]
): Promise<void> {
  const targetPanelIds = new Set(targetPanels.map((panel) => panel.id));
  const panelIdsToDelete = currentPanels
    .filter((panel) => !targetPanelIds.has(panel.id))
    .map((panel) => panel.id);

  if (panelIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("zentai_gamen")
      .delete()
      .in("id", panelIdsToDelete);

    if (error) throw error;
  }

  if (targetPanels.length === 0) return;

  const upsertRows = targetPanels.map((panel) => ({
    id: panel.id,
    project_id: projectId,
    name: panel.name,
    grid_data: panel.grid_data,
    thumbnail: null,
    position_x: panel.position_x,
    position_y: panel.position_y,
    memo: panel.memo,
    panel_type: panel.panel_type,
    motion_type: panel.motion_type,
    motion_data: panel.motion_data,
    panel_duration_override_ms: panel.panel_duration_override_ms,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("zentai_gamen")
    .upsert(upsertRows, { onConflict: "id" });

  if (error) throw error;
}

async function applyConnections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<void> {
  const deleteResult = await supabase
    .from("connections")
    .delete()
    .eq("project_id", projectId);

  if (deleteResult.error) throw deleteResult.error;
}

async function insertConnections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  connections: Pick<
    Connection,
    "id" | "source_id" | "target_id" | "sort_order" | "interval_override_ms"
  >[]
): Promise<void> {
  if (connections.length === 0) return;

  const insertRows = connections.map((connection) => ({
    id: connection.id,
    project_id: projectId,
    source_id: connection.source_id,
    target_id: connection.target_id,
    sort_order: connection.sort_order,
    interval_override_ms: connection.interval_override_ms,
  }));

  const { error } = await supabase.from("connections").insert(insertRows);
  if (error) throw error;
}

async function applyProjectState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  currentPanels: ZentaiGamen[],
  state: ProjectState
): Promise<Project> {
  await applyConnections(supabase, projectId);
  await applyPanels(supabase, projectId, currentPanels, state.panels);
  await insertConnections(supabase, projectId, state.connections);

  const { data: updatedProject, error } = await supabase
    .from("projects")
    .update({
      name: state.project.name,
      grid_width: state.project.grid_width,
      grid_height: state.project.grid_height,
      colors: state.project.colors,
      default_panel_duration_ms: state.project.default_panel_duration_ms,
      default_interval_ms: state.project.default_interval_ms,
      music_data: state.project.music_data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select("*")
    .single();

  if (error || !updatedProject) {
    throw error ?? new Error("Project update failed");
  }

  return updatedProject;
}

function buildPanelsFromSnapshot(
  projectId: string,
  panels: ProjectGridResizeHistorySnapshotPanel[]
): ZentaiGamen[] {
  return panels.map((panel) => ({
    ...panel,
    project_id: projectId,
    thumbnail: null,
    created_at: panel.updated_at,
  }));
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; historyId: string }> }
) {
  const { projectId, historyId } = await context.params;
  const supabase = await createClient();

  const { data: history, error: historyError } = await supabase
    .from("project_grid_resize_history")
    .select("*")
    .eq("id", historyId)
    .eq("project_id", projectId)
    .single();

  if (historyError || !history) {
    return NextResponse.json(
      { error: "復元対象の履歴が見つかりません" },
      { status: 404 }
    );
  }

  const typedHistory = history as ProjectGridResizeHistory;
  if (!isRestorableResizeHistorySnapshot(typedHistory.snapshot)) {
    return NextResponse.json(
      { error: "旧形式の履歴は復元できません" },
      { status: 400 }
    );
  }

  let currentState: ProjectState;
  try {
    currentState = await fetchProjectState(supabase, projectId);
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
  let createdRollbackHistoryId: string | null = null;

  try {
    createdRollbackHistoryId = await createRollbackHistory(supabase, {
      projectId,
      currentState,
      targetWidth: typedHistory.snapshot.project.grid_width,
      targetHeight: typedHistory.snapshot.project.grid_height,
    });

    const updatedProject = await applyProjectState(
      supabase,
      projectId,
      currentState.panels,
      {
        project: {
          ...currentState.project,
          name: typedHistory.snapshot.project.name,
          grid_width: typedHistory.snapshot.project.grid_width,
          grid_height: typedHistory.snapshot.project.grid_height,
          colors: typedHistory.snapshot.project.colors,
          default_panel_duration_ms:
            typedHistory.snapshot.project.default_panel_duration_ms,
          default_interval_ms:
            typedHistory.snapshot.project.default_interval_ms,
          music_data: typedHistory.snapshot.project.music_data,
        },
        panels: buildPanelsFromSnapshot(projectId, typedHistory.snapshot.panels),
        connections: typedHistory.snapshot.connections.map((connection) => ({
          ...connection,
          project_id: projectId,
          created_at: new Date().toISOString(),
        })),
      }
    );

    return NextResponse.json({
      project: updatedProject,
      restoredHistoryId: typedHistory.id,
      createdRollbackHistoryId,
    });
  } catch (error) {
    let rollbackSourcePanels: ZentaiGamen[] = buildPanelsFromSnapshot(
      projectId,
      typedHistory.snapshot.panels
    );

    try {
      const rollbackState = await fetchProjectState(supabase, projectId);
      rollbackSourcePanels = rollbackState.panels;
    } catch {
      // Best effort fallback to the target snapshot ids.
    }

    try {
      await applyProjectState(
        supabase,
        projectId,
        rollbackSourcePanels,
        currentState
      );
    } catch (rollbackError) {
      return NextResponse.json(
        {
          error: `復元に失敗し、ロールバックにも失敗しました: ${getErrorMessage(rollbackError)}`,
        },
        { status: 500 }
      );
    }

    if (createdRollbackHistoryId) {
      const { error: cleanupError } = await supabase
        .from("project_grid_resize_history")
        .delete()
        .eq("id", createdRollbackHistoryId);

      if (cleanupError) {
        return NextResponse.json(
          {
            error: `復元に失敗し、履歴クリーンアップにも失敗しました: ${getErrorMessage(cleanupError)}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
