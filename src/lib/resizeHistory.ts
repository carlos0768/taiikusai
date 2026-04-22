import type {
  Connection,
  Project,
  ProjectGridResizeHistory,
  ProjectGridResizeHistorySnapshot,
  ProjectGridResizeHistorySnapshotConnection,
  ProjectGridResizeHistorySnapshotPanel,
  RestorableProjectGridResizeHistorySnapshot,
  ZentaiGamen,
} from "@/types";

export function buildResizeHistorySnapshotPanels(
  panels: ZentaiGamen[]
): ProjectGridResizeHistorySnapshotPanel[] {
  return panels.map((panel) => ({
    id: panel.id,
    name: panel.name,
    grid_data: panel.grid_data,
    position_x: panel.position_x,
    position_y: panel.position_y,
    memo: panel.memo,
    panel_type: panel.panel_type,
    motion_type: panel.motion_type,
    motion_data: panel.motion_data,
    panel_duration_override_ms: panel.panel_duration_override_ms,
    updated_at: panel.updated_at,
  }));
}

export function buildResizeHistorySnapshotConnections(
  connections: Connection[]
): ProjectGridResizeHistorySnapshotConnection[] {
  return connections.map((connection) => ({
    id: connection.id,
    source_id: connection.source_id,
    target_id: connection.target_id,
    sort_order: connection.sort_order,
    interval_override_ms: connection.interval_override_ms,
  }));
}

export function buildResizeHistorySnapshot(
  project: Project,
  panels: ZentaiGamen[],
  connections: Connection[]
): ProjectGridResizeHistorySnapshot {
  return {
    project: {
      id: project.id,
      name: project.name,
      grid_width: project.grid_width,
      grid_height: project.grid_height,
      colors: [...project.colors],
      default_panel_duration_ms: project.default_panel_duration_ms,
      default_interval_ms: project.default_interval_ms,
      music_data: project.music_data,
    },
    panels: buildResizeHistorySnapshotPanels(panels),
    connections: buildResizeHistorySnapshotConnections(connections),
  };
}

export function isRestorableResizeHistorySnapshot(
  snapshot: ProjectGridResizeHistorySnapshot
): snapshot is RestorableProjectGridResizeHistorySnapshot {
  return (
    Array.isArray(snapshot.panels) &&
    Array.isArray(snapshot.connections) &&
    Array.isArray(snapshot.project.colors) &&
    Object.prototype.hasOwnProperty.call(snapshot.project, "music_data")
  );
}

export function isResizeHistoryRestorable(
  history: Pick<ProjectGridResizeHistory, "snapshot">
): boolean {
  return isRestorableResizeHistorySnapshot(history.snapshot);
}

export function getResizeHistoryPanelCount(
  history: Pick<ProjectGridResizeHistory, "snapshot">
): number {
  return Array.isArray(history.snapshot.panels) ? history.snapshot.panels.length : 0;
}
