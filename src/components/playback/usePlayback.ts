"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFrameTotalMs, type PlaybackFrame } from "@/lib/grid/types";

/**
 * 再生フック。
 *
 * 一般フレーム: そのまま durationMs だけ表示 → 白フレーム → 次。
 * ウェーブフレーム: 素地表示 → 列単位伝播 → 適用後表示 (合計時間は frame の各時間の和) → 白 → 次。
 *
 * `frameElapsedMs` はウェーブの描画進捗 (現在のフレーム内での経過 ms) を返す。
 * 一般フレームでは 0 のまま。
 */
export function usePlayback(frames: PlaybackFrame[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWhiteFrame, setIsWhiteFrame] = useState(false);
  const [frameElapsedMs, setFrameElapsedMs] = useState(0);
  // 各フレームの実効表示時間 (一般: 編集可、ウェーブ: 内部時間の合計、表示用)
  const [durations, setDurations] = useState<number[]>(() =>
    frames.map((f) => getFrameTotalMs(f))
  );
  // 折り (白フレーム) の時間: フレーム数 - 1
  const [intervals, setIntervals] = useState<number[]>(() =>
    Array(Math.max(0, frames.length - 1)).fill(1000)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // フレーム数が変わったら intervals / durations を再構築
  // (React 推奨パターン: 前回のキーを state で保持し、render 中に検知して setState)
  const [prevFramesLen, setPrevFramesLen] = useState(frames.length);
  if (prevFramesLen !== frames.length) {
    setPrevFramesLen(frames.length);
    setIntervals((prev) => {
      const target = Math.max(0, frames.length - 1);
      if (prev.length === target) return prev;
      const next: number[] = Array(target).fill(1000);
      for (let i = 0; i < Math.min(prev.length, target); i++) next[i] = prev[i];
      return next;
    });
    setDurations((prev) => {
      if (prev.length === frames.length) return prev;
      return frames.map((f, i) =>
        i < prev.length && f.kind === "general" ? prev[i] : getFrameTotalMs(f)
      );
    });
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (frames.length === 0) return;
    setIsPlaying(true);
  }, [frames.length]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    setIsWhiteFrame(false);
    setFrameElapsedMs(0);
    clearTimer();
  }, [clearTimer]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setIsWhiteFrame(false);
    setFrameElapsedMs(0);
    clearTimer();
    setCurrentIndex(0);
  }, [clearTimer]);

  const next = useCallback(() => {
    setIsWhiteFrame(false);
    setFrameElapsedMs(0);
    setCurrentIndex((prev) => Math.min(prev + 1, frames.length - 1));
  }, [frames.length]);

  const prev = useCallback(() => {
    setIsWhiteFrame(false);
    setFrameElapsedMs(0);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setIsWhiteFrame(false);
      setFrameElapsedMs(0);
      setCurrentIndex(Math.max(0, Math.min(index, frames.length - 1)));
    },
    [frames.length]
  );

  const setGapInterval = useCallback((index: number, ms: number) => {
    setIntervals((prev) => {
      const copy = [...prev];
      if (index >= 0 && index < copy.length) copy[index] = ms;
      return copy;
    });
  }, []);

  // 一般フレームのみ表示時間を編集可能。ウェーブフレームは無視 (内部時間で固定)。
  const setFrameDuration = useCallback(
    (index: number, ms: number) => {
      const frame = frames[index];
      if (!frame || frame.kind !== "general") return;
      setDurations((prev) => {
        const copy = [...prev];
        if (index >= 0 && index < copy.length) copy[index] = ms;
        return copy;
      });
    },
    [frames]
  );

  // フレーム表示 (general: setTimeout, wave: rAF) → 白 → 次
  useEffect(() => {
    if (!isPlaying) return;
    if (frames.length === 0) return;

    if (!isWhiteFrame) {
      const frame = frames[currentIndex];
      if (!frame) return;
      const totalMs =
        frame.kind === "general"
          ? durations[currentIndex] ?? frame.durationMs
          : getFrameTotalMs(frame);

      if (frame.kind === "general") {
        // 一般: 単に時間が経つのを待つ (frameElapsedMs は使わない)
        timerRef.current = setTimeout(() => {
          if (currentIndex >= frames.length - 1) {
            setIsPlaying(false);
          } else {
            setIsWhiteFrame(true);
          }
        }, totalMs);
      } else {
        // ウェーブ: rAF で経過時間を更新し、totalMs に達したら遷移
        const startTime = performance.now();
        const tick = () => {
          const elapsed = performance.now() - startTime;
          if (elapsed >= totalMs) {
            setFrameElapsedMs(totalMs);
            if (currentIndex >= frames.length - 1) {
              setIsPlaying(false);
            } else {
              setIsWhiteFrame(true);
            }
            rafRef.current = null;
            return;
          }
          setFrameElapsedMs(elapsed);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } else {
      const gapMs = intervals[currentIndex] ?? 1000;
      timerRef.current = setTimeout(() => {
        setIsWhiteFrame(false);
        setFrameElapsedMs(0);
        setCurrentIndex((prev) => prev + 1);
      }, gapMs);
    }

    return clearTimer;
  }, [isPlaying, currentIndex, isWhiteFrame, intervals, durations, frames, clearTimer]);

  return {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    frameElapsedMs,
    intervals,
    durations,
    setGapInterval,
    setFrameDuration,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  };
}
