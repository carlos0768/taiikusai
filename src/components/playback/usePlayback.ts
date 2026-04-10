"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlayback(frameCount: number) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(2000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (frameCount <= 1) return;
    setIsPlaying(true);
  }, [frameCount]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
    setCurrentIndex(0);
  }, [clearTimer]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, frameCount - 1));
  }, [frameCount]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.max(0, Math.min(index, frameCount - 1)));
    },
    [frameCount]
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= frameCount - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return clearTimer;
  }, [isPlaying, intervalMs, frameCount, clearTimer]);

  return {
    currentIndex,
    isPlaying,
    intervalMs,
    setIntervalMs,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  };
}
