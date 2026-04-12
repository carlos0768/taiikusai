export type ColorIndex = 0 | 1 | 2 | 3 | 4;

export const COLOR_MAP: Record<ColorIndex, string> = {
  0: "#FFFFFF", // white (fold / default)
  1: "#FFD700", // yellow
  2: "#FF0000", // red
  3: "#000000", // black
  4: "#0000FF", // blue
} as const;

export const COLOR_NAMES: Record<ColorIndex, string> = {
  0: "白",
  1: "黄",
  2: "赤",
  3: "黒",
  4: "青",
} as const;

export const NUM_COLORS = 5;

export interface GridData {
  width: number;
  height: number;
  cells: Uint8Array;
}

export function createEmptyGrid(width: number, height: number): GridData {
  return {
    width,
    height,
    cells: new Uint8Array(width * height), // all zeros = white
  };
}

export function getCell(grid: GridData, x: number, y: number): ColorIndex {
  return grid.cells[y * grid.width + x] as ColorIndex;
}

export function setCell(
  grid: GridData,
  x: number,
  y: number,
  color: ColorIndex
): void {
  grid.cells[y * grid.width + x] = color;
}

export function cloneGrid(grid: GridData): GridData {
  return {
    width: grid.width,
    height: grid.height,
    cells: new Uint8Array(grid.cells),
  };
}

/**
 * PlaybackFrame: アニメーション再生で扱うフレーム
 *  - general: 従来の一般パネル。フレーム到来時に grid 全体を一斉表示する
 *  - wave:    モーションパネル (ウェーブ)。素地 → 列単位伝播 → 適用後 と流れる
 */
export type PlaybackFrame =
  | {
      kind: "general";
      grid: GridData;
      durationMs: number;
      name: string;
    }
  | {
      kind: "wave";
      before: GridData;
      after: GridData;
      beforeMs: number;
      afterMs: number;
      speedColPerSec: number;
      name: string;
    };

/** ウェーブ伝播部分の所要時間 (ms)。speed が極端に小さい場合は最低 1 列分とする。 */
export function waveSweepMs(
  width: number,
  speedColPerSec: number
): number {
  const safeSpeed = Math.max(0.1, speedColPerSec);
  return (width / safeSpeed) * 1000;
}

/** PlaybackFrame の総表示時間 (ms)。usePlayback の遷移計算で使用。 */
export function getFrameTotalMs(frame: PlaybackFrame): number {
  if (frame.kind === "general") return frame.durationMs;
  return frame.beforeMs + waveSweepMs(frame.before.width, frame.speedColPerSec) + frame.afterMs;
}

/**
 * ウェーブフレームの経過時間に対し、何列まで after に切り替わっているかを返す。
 * 0 〜 width の整数。
 */
export function waveChangedColsAt(
  frame: Extract<PlaybackFrame, { kind: "wave" }>,
  elapsedMs: number
): number {
  const wavePhaseMs = elapsedMs - frame.beforeMs;
  if (wavePhaseMs <= 0) return 0;
  const sweepMs = waveSweepMs(frame.before.width, frame.speedColPerSec);
  if (wavePhaseMs >= sweepMs) return frame.before.width;
  return Math.min(
    frame.before.width,
    Math.floor((wavePhaseMs / 1000) * frame.speedColPerSec)
  );
}
