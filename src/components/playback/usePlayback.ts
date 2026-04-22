"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFrameTotalMs, type PlaybackFrame } from "@/lib/grid/types";
import { DEFAULT_INTERVAL_MS } from "@/lib/playback/timing";

/**
 * 再生フック。
 *
 * 一般フレーム: そのまま durationMs だけ表示 → 白フレーム → 次。
 * keep フレーム: 直前 gap の長さだけ保持表示 → 次。
 * ウェーブフレーム: 素地表示 → 列単位伝播 → 適用後表示 (合計時間は frame の各時間の和) → 白 → 次。
 *
 * `frameElapsedMs` はウェーブの描画進捗 (現在のフレーム内での経過 ms) を返す。
 * 一般フレームでは 0 のまま。
 */
export function usePlayback(params: {
  frames: PlaybackFrame[];
  durations: number[];
  intervals: number[];
}) {
  const { frames, durations, intervals } = params;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWhiteFrame, setIsWhiteFrame] = useState(false);
  const [frameElapsedMs, setFrameElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const [prevFramesLen, setPrevFramesLen] = useState(frames.length);

  if (prevFramesLen !== frames.length) {
    setPrevFramesLen(frames.length);
    if (frames.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      if (isPlaying) setIsPlaying(false);
      if (isWhiteFrame) setIsWhiteFrame(false);
      if (frameElapsedMs !== 0) setFrameElapsedMs(0);
    } else if (currentIndex > frames.length - 1) {
      setCurrentIndex(frames.length - 1);
    }
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

  useEffect(() => {
    if (frames.length === 0) clearTimer();
  }, [frames.length, clearTimer]);

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

      if (frame.kind === "general" || frame.kind === "keep") {
        // 一般: 単に時間が経つのを待つ (frameElapsedMs は使わない)
        timerRef.current = setTimeout(() => {
          if (currentIndex >= frames.length - 1) {
            setIsPlaying(false);
          } else {
            const nextFrame = frames[currentIndex + 1];
            if (nextFrame?.kind === "keep") {
              setFrameElapsedMs(0);
              setCurrentIndex((prev) => Math.min(prev + 1, frames.length - 1));
            } else {
              setIsWhiteFrame(true);
            }
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
              const nextFrame = frames[currentIndex + 1];
              if (nextFrame?.kind === "keep") {
                setFrameElapsedMs(0);
                setCurrentIndex((prev) => Math.min(prev + 1, frames.length - 1));
              } else {
                setIsWhiteFrame(true);
              }
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
      const gapMs = intervals[currentIndex] ?? DEFAULT_INTERVAL_MS;
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
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  };
}
