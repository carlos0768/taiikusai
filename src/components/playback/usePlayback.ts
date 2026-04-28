"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  frameStartMs,
  resolvePlaybackPosition,
} from "@/lib/playback/resolvePosition";
import type { PlaybackTimeline } from "@/lib/playback/frameBuilder";
import type { MasterClock } from "./masterClock";

/**
 * 再生フック。マスタークロック (clock.now()) から UI 状態を派生させる。
 *
 * - 単一の rAF ループのみ。`setTimeout` / 並列タイマーは使わない。
 * - 音楽プレイヤーの play/pause/seek は呼び出し元の責務 (このフックは clock 操作のみ)。
 *   音楽あり時、clock 自体が音楽 currentTime を真実とするので構造的にズレない。
 */
export function usePlayback(params: {
  timeline: PlaybackTimeline;
  clock: MasterClock;
}) {
  const { timeline, clock } = params;
  const totalFrames = timeline.frameItems.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWhiteFrame, setIsWhiteFrame] = useState(false);
  const [frameElapsedMs, setFrameElapsedMs] = useState(0);
  const [prevFramesLen, setPrevFramesLen] = useState(totalFrames);

  // フレーム数が変わったら範囲外を補正・空なら停止
  if (prevFramesLen !== totalFrames) {
    setPrevFramesLen(totalFrames);
    if (totalFrames === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      if (isPlaying) {
        setIsPlaying(false);
        clock.reset();
      }
      if (isWhiteFrame) setIsWhiteFrame(false);
      if (frameElapsedMs !== 0) setFrameElapsedMs(0);
    } else if (currentIndex > totalFrames - 1) {
      setCurrentIndex(totalFrames - 1);
    }
  }

  const play = useCallback(() => {
    if (timeline.frameItems.length === 0) return;
    // 終端から再生ボタンを押したら頭に戻す (停止状態相当)
    if (clock.now() >= timeline.totalMs) {
      clock.reset();
      setCurrentIndex(0);
      setIsWhiteFrame(false);
      setFrameElapsedMs(0);
    }
    clock.start();
    setIsPlaying(true);
  }, [clock, timeline]);

  const pause = useCallback(() => {
    clock.pause();
    setIsPlaying(false);
  }, [clock]);

  const stop = useCallback(() => {
    clock.reset();
    setIsPlaying(false);
    setIsWhiteFrame(false);
    setFrameElapsedMs(0);
    setCurrentIndex(0);
  }, [clock]);

  const goTo = useCallback(
    (index: number) => {
      const total = timeline.frameItems.length;
      if (total === 0) return;
      const clamped = Math.max(0, Math.min(index, total - 1));
      const target = frameStartMs(timeline, clamped);
      clock.seek(target);
      const pos = resolvePlaybackPosition(timeline, target);
      setCurrentIndex(pos.currentIndex);
      setIsWhiteFrame(pos.isWhiteFrame);
      setFrameElapsedMs(pos.frameElapsedMs);
    },
    [timeline, clock]
  );

  const next = useCallback(() => {
    goTo(currentIndex + 1);
  }, [goTo, currentIndex]);

  const prev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [goTo, currentIndex]);

  // 単一 rAF ループ: clock.now() → resolvePlaybackPosition で UI 状態を派生
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying) return;
    if (timeline.frameItems.length === 0) return;

    const tick = () => {
      const t = clock.now();
      const pos = resolvePlaybackPosition(timeline, t);

      setCurrentIndex((prev) =>
        prev === pos.currentIndex ? prev : pos.currentIndex
      );
      setIsWhiteFrame((prev) =>
        prev === pos.isWhiteFrame ? prev : pos.isWhiteFrame
      );
      setFrameElapsedMs((prev) =>
        prev === pos.frameElapsedMs ? prev : pos.frameElapsedMs
      );

      if (pos.reachedEnd) {
        clock.pause();
        setIsPlaying(false);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, timeline, clock]);

  return {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    frameElapsedMs,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  };
}
