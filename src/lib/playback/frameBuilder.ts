import { decodeGrid } from "@/lib/grid/codec";
import {
  getFrameTotalMs,
  getPlaybackFrameFinalGrid,
  type GridData,
  type PlaybackFrame,
} from "@/lib/grid/types";
import {
  normalizeKeepMaskGrid,
  resolveKeepDisplayGrid,
} from "@/lib/keep";
import type { Connection, ZentaiGamen } from "@/types";
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_PANEL_DURATION_MS,
} from "@/lib/playback/timing";

export interface PlaybackFrameItem {
  zentaiGamenId: string;
  frame: PlaybackFrame;
  durationMs: number;
  timelineWidthMs: number;
  isDurationOverride: boolean;
  isDurationEditable: boolean;
}

export interface PlaybackGapItem {
  connectionId: string | null;
  intervalMs: number;
  transitionKind: "white" | "keep";
  isIntervalOverride: boolean;
  isIntervalEditable: boolean;
}

export interface PlaybackTimeline {
  frameItems: PlaybackFrameItem[];
  gapItems: PlaybackGapItem[];
  defaultPanelDurationMs: number;
  defaultIntervalMs: number;
}

export function getPanelDurationMs(
  zg: ZentaiGamen,
  defaultPanelDurationMs: number = DEFAULT_PANEL_DURATION_MS
): number {
  return zg.panel_duration_override_ms ?? defaultPanelDurationMs;
}

export function getIntervalDurationMs(
  connection: Connection,
  defaultIntervalMs: number = DEFAULT_INTERVAL_MS
): number {
  return connection.interval_override_ms ?? defaultIntervalMs;
}

/**
 * ZentaiGamen を再生用の PlaybackFrame に変換する。
 * - panel_type === 'motion' && motion_type === 'wave' の場合: ウェーブフレームを構築
 * - それ以外: 一般フレーム (durationMs はデフォルト 2000ms)
 */
export function zentaiGamenToPlaybackFrame(
  params: {
    zentaiGamen: ZentaiGamen;
    gridWidth: number;
    gridHeight: number;
    defaultPanelDurationMs?: number;
    previousVisibleGrid?: GridData | null;
    keepDurationMs?: number;
  }
): PlaybackFrame {
  const {
    zentaiGamen: zg,
    gridWidth,
    gridHeight,
    defaultPanelDurationMs = DEFAULT_PANEL_DURATION_MS,
    previousVisibleGrid = null,
    keepDurationMs = 0,
  } = params;

  if (zg.panel_type === "keep") {
    const mask = normalizeKeepMaskGrid(
      decodeGrid(zg.grid_data, gridWidth, gridHeight)
    );
    return {
      kind: "keep",
      mask,
      displayGrid: resolveKeepDisplayGrid(previousVisibleGrid, mask),
      durationMs: keepDurationMs,
      name: zg.name,
    };
  }

  if (
    zg.panel_type === "motion" &&
    zg.motion_type === "wave" &&
    zg.motion_data
  ) {
    return {
      kind: "wave",
      before: decodeGrid(zg.grid_data, gridWidth, gridHeight),
      after: decodeGrid(zg.motion_data.after_grid_data, gridWidth, gridHeight),
      beforeMs: zg.motion_data.before_duration_ms,
      afterMs: zg.motion_data.after_duration_ms,
      speedColPerSec: zg.motion_data.speed_columns_per_sec,
      name: zg.name,
    };
  }
  return {
    kind: "general",
    grid: decodeGrid(zg.grid_data, gridWidth, gridHeight),
    durationMs: getPanelDurationMs(zg, defaultPanelDurationMs),
    name: zg.name,
  };
}

export function buildPlaybackTimeline(params: {
  route: string[];
  zentaiGamen: ZentaiGamen[];
  connections: Connection[];
  gridWidth: number;
  gridHeight: number;
  defaultPanelDurationMs?: number;
  defaultIntervalMs?: number;
}): PlaybackTimeline {
  const {
    route,
    zentaiGamen,
    connections,
    gridWidth,
    gridHeight,
    defaultPanelDurationMs = DEFAULT_PANEL_DURATION_MS,
    defaultIntervalMs = DEFAULT_INTERVAL_MS,
  } = params;
  const zgMap = new Map(zentaiGamen.map((zg) => [zg.id, zg]));
  const connectionMap = new Map(
    connections.map((connection) => [
      `${connection.source_id}:${connection.target_id}`,
      connection,
    ])
  );

  const frameItems: PlaybackFrameItem[] = [];
  const gapItems: PlaybackGapItem[] = [];
  let previousVisibleGrid: GridData | null = null;

  route.forEach((nodeId, index) => {
    const zg = zgMap.get(nodeId);
    if (!zg) return;
    const previousNodeId = index > 0 ? route[index - 1] : null;
    const previousConnection =
      previousNodeId !== null
        ? connectionMap.get(`${previousNodeId}:${nodeId}`)
        : undefined;

    const frame = zentaiGamenToPlaybackFrame({
      zentaiGamen: zg,
      gridWidth,
      gridHeight,
      defaultPanelDurationMs,
      previousVisibleGrid,
      keepDurationMs: previousConnection
        ? getIntervalDurationMs(previousConnection, defaultIntervalMs)
        : 0,
    });
    const durationMs = getFrameTotalMs(frame);

    frameItems.push({
      zentaiGamenId: zg.id,
      frame,
      durationMs,
      timelineWidthMs: frame.kind === "keep" ? 0 : durationMs,
      isDurationOverride:
        frame.kind === "general" && zg.panel_duration_override_ms !== null,
      isDurationEditable: frame.kind === "general",
    });
    previousVisibleGrid = getPlaybackFrameFinalGrid(frame);

    if (index >= route.length - 1) return;

    const nextId = route[index + 1];
    const connection = connectionMap.get(`${nodeId}:${nextId}`);
    const nextZentaiGamen = zgMap.get(nextId);
    gapItems.push({
      connectionId: connection?.id ?? null,
      intervalMs: connection
        ? getIntervalDurationMs(connection, defaultIntervalMs)
        : defaultIntervalMs,
      transitionKind:
        nextZentaiGamen?.panel_type === "keep" ? "keep" : "white",
      isIntervalOverride: connection?.interval_override_ms !== null,
      isIntervalEditable: Boolean(connection),
    });
  });

  return {
    frameItems,
    gapItems,
    defaultPanelDurationMs,
    defaultIntervalMs,
  };
}
