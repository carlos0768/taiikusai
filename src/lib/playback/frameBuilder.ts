import { decodeGrid } from "@/lib/grid/codec";
import {
  createEmptyGrid,
  getFrameTotalMs,
  getPlaybackFrameFinalGrid,
  type GridData,
  type PlaybackFrame,
} from "@/lib/grid/types";
import {
  applyKeepTransition,
  decodeKeepMask,
  filterKeepMaskBySameColor,
  hasKeepCells,
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
  transitionKind: "gray" | "keep";
  transitionGrid: GridData | null;
  isIntervalOverride: boolean;
  isIntervalEditable: boolean;
}

export interface PlaybackSegment {
  /** kind に応じて frameItems / gapItems のインデックスを指す */
  index: number;
  kind: "frame" | "gap";
  /** 再生開始 (elapsedMs=0) からの累積開始時刻 */
  startMs: number;
  /** 区間の終端。次セグメントの startMs と一致する (totalMs まで連続) */
  endMs: number;
}

export interface PlaybackTimeline {
  frameItems: PlaybackFrameItem[];
  gapItems: PlaybackGapItem[];
  defaultPanelDurationMs: number;
  defaultIntervalMs: number;
  /**
   * frame, gap, frame, gap, ..., frame の順で並ぶ累積タイムライン。
   * 単一マスタークロックから現在位置を派生させるために使う。
   */
  segments: PlaybackSegment[];
  /** タイムライン全体の長さ (ms)。最終 frame の endMs と一致 */
  totalMs: number;
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
 * - それ以外: 一般フレーム
 */
export function zentaiGamenToPlaybackFrame(
  params: {
    zentaiGamen: ZentaiGamen;
    gridWidth: number;
    gridHeight: number;
    defaultPanelDurationMs?: number;
  }
): PlaybackFrame {
  const {
    zentaiGamen: zg,
    gridWidth,
    gridHeight,
    defaultPanelDurationMs = DEFAULT_PANEL_DURATION_MS,
  } = params;

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

  route.forEach((nodeId, index) => {
    const zg = zgMap.get(nodeId);
    if (!zg) return;

    const frame = zentaiGamenToPlaybackFrame({
      zentaiGamen: zg,
      gridWidth,
      gridHeight,
      defaultPanelDurationMs,
    });
    const durationMs = getFrameTotalMs(frame);

    frameItems.push({
      zentaiGamenId: zg.id,
      frame,
      durationMs,
      timelineWidthMs: durationMs,
      isDurationOverride:
        frame.kind === "general" && zg.panel_duration_override_ms !== null,
      isDurationEditable: frame.kind === "general",
    });

    if (index >= route.length - 1) return;

    const nextId = route[index + 1];
    const connection = connectionMap.get(`${nodeId}:${nextId}`);
    const nextZentaiGamen = zgMap.get(nextId);
    const rawMask = decodeKeepMask(
      connection?.keep_mask_grid_data,
      gridWidth,
      gridHeight
    );
    let transitionGrid: GridData | null = createEmptyGrid(gridWidth, gridHeight);
    let transitionKind: PlaybackGapItem["transitionKind"] = "gray";

    if (connection && nextZentaiGamen && rawMask) {
      const nextFrame = zentaiGamenToPlaybackFrame({
        zentaiGamen: nextZentaiGamen,
        gridWidth,
        gridHeight,
        defaultPanelDurationMs,
      });
      const sourceGrid = getPlaybackFrameFinalGrid(frame);
      const targetGrid = getPlaybackFrameFinalGrid(nextFrame);
      const keepMask = filterKeepMaskBySameColor(sourceGrid, targetGrid, rawMask);

      if (hasKeepCells(keepMask)) {
        transitionGrid = applyKeepTransition(sourceGrid, keepMask);
        transitionKind = "keep";
      }
    }

    gapItems.push({
      connectionId: connection?.id ?? null,
      intervalMs: connection
        ? getIntervalDurationMs(connection, defaultIntervalMs)
        : defaultIntervalMs,
      transitionKind,
      transitionGrid,
      isIntervalOverride: connection?.interval_override_ms !== null,
      isIntervalEditable: Boolean(connection),
    });
  });

  const { segments, totalMs } = buildSegments(frameItems, gapItems);

  return {
    frameItems,
    gapItems,
    defaultPanelDurationMs,
    defaultIntervalMs,
    segments,
    totalMs,
  };
}

/**
 * frame/gap の長さから累積セグメントを再構築する。
 * frame duration / gap interval の override 変更時に PlaybackPanel 側で再計算するために
 * 公開する。
 */
export function buildSegments(
  frameItems: PlaybackFrameItem[],
  gapItems: PlaybackGapItem[]
): { segments: PlaybackSegment[]; totalMs: number } {
  const segments: PlaybackSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < frameItems.length; i++) {
    const frameMs = frameItems[i].timelineWidthMs;
    segments.push({
      index: i,
      kind: "frame",
      startMs: cursor,
      endMs: cursor + frameMs,
    });
    cursor += frameMs;
    if (i < gapItems.length) {
      const gapMs = gapItems[i].intervalMs;
      segments.push({
        index: i,
        kind: "gap",
        startMs: cursor,
        endMs: cursor + gapMs,
      });
      cursor += gapMs;
    }
  }
  return { segments, totalMs: cursor };
}
