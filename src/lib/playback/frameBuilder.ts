import { decodeGrid } from "@/lib/grid/codec";
import type { PlaybackFrame } from "@/lib/grid/types";
import type { ZentaiGamen } from "@/types";

/**
 * ZentaiGamen を再生用の PlaybackFrame に変換する。
 * - panel_type === 'motion' && motion_type === 'wave' の場合: ウェーブフレームを構築
 * - それ以外: 一般フレーム (durationMs はデフォルト 2000ms)
 */
export function zentaiGamenToPlaybackFrame(
  zg: ZentaiGamen,
  gridWidth: number,
  gridHeight: number
): PlaybackFrame {
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
    durationMs: 2000,
    name: zg.name,
  };
}
