import type { PlaybackTimeline } from "./frameBuilder";

export interface ResolvedPosition {
  /** 表示中フレームの index (frameItems / gapItems と同じインデックス空間) */
  currentIndex: number;
  /** gap 中 (white / keep フレーム) かどうか */
  isWhiteFrame: boolean;
  /** 現在のセグメント (frame か gap) 内での経過 ms。wave 描画はこれを参照する */
  frameElapsedMs: number;
  /** elapsedMs がタイムライン終端以降に達したか */
  reachedEnd: boolean;
}

/**
 * 単一マスタークロックの elapsedMs から再生 UI 状態を派生させる。
 * 二分探索で O(log n)。`segments` が空のときは終端扱い。
 */
export function resolvePlaybackPosition(
  timeline: PlaybackTimeline,
  elapsedMs: number
): ResolvedPosition {
  const { segments, totalMs } = timeline;

  if (segments.length === 0) {
    return {
      currentIndex: 0,
      isWhiteFrame: false,
      frameElapsedMs: 0,
      reachedEnd: true,
    };
  }

  if (elapsedMs <= 0) {
    const head = segments[0];
    return {
      currentIndex: head.index,
      isWhiteFrame: head.kind === "gap",
      frameElapsedMs: 0,
      reachedEnd: false,
    };
  }

  if (elapsedMs >= totalMs) {
    const last = segments[segments.length - 1];
    return {
      currentIndex: last.index,
      isWhiteFrame: last.kind === "gap",
      frameElapsedMs: last.endMs - last.startMs,
      reachedEnd: true,
    };
  }

  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (elapsedMs < segments[mid].endMs) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const seg = segments[lo];
  return {
    currentIndex: seg.index,
    isWhiteFrame: seg.kind === "gap",
    frameElapsedMs: elapsedMs - seg.startMs,
    reachedEnd: false,
  };
}

/**
 * frame index に対応するセグメントの開始時刻 (ms) を返す。goTo で使う。
 */
export function frameStartMs(
  timeline: PlaybackTimeline,
  frameIndex: number
): number {
  for (const seg of timeline.segments) {
    if (seg.kind === "frame" && seg.index === frameIndex) return seg.startMs;
  }
  return 0;
}
