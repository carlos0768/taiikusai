"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlayback(frameCount: number) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWhiteFrame, setIsWhiteFrame] = useState(false);
  // Per-frame display duration (ms)
  const [durations, setDurations] = useState<number[]>(() =>
    Array(frameCount).fill(500)
  );
  // Per-gap fold interval (ms)
  const [intervals, setIntervals] = useState<number[]>(() =>
    Array(Math.max(0, frameCount - 1)).fill(1000)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    if (frameCount <= 1) return;
    setIsPlaying(true);
  }, [frameCount]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    setIsWhiteFrame(false);
    clearTimer();
  }, [clearTimer]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setIsWhiteFrame(false);
    clearTimer();
    setCurrentIndex(0);
  }, [clearTimer]);

  const next = useCallback(() => {
    setIsWhiteFrame(false);
    setCurrentIndex((prev) => Math.min(prev + 1, frameCount - 1));
  }, [frameCount]);

  const prev = useCallback(() => {
    setIsWhiteFrame(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setIsWhiteFrame(false);
      setCurrentIndex(Math.max(0, Math.min(index, frameCount - 1)));
    },
    [frameCount]
  );

  const setGapInterval = useCallback((index: number, ms: number) => {
    setIntervals((prev) => {
      const copy = [...prev];
      if (index >= 0 && index < copy.length) copy[index] = ms;
      return copy;
    });
  }, []);

  const setFrameDuration = useCallback((index: number, ms: number) => {
    setDurations((prev) => {
      const copy = [...prev];
      if (index >= 0 && index < copy.length) copy[index] = ms;
      return copy;
    });
  }, []);

  // Playback loop: frame (duration) → white gap (interval) → next frame
  useEffect(() => {
    if (!isPlaying) return;

    if (!isWhiteFrame) {
      const durationMs = durations[currentIndex] ?? 500;
      if (currentIndex >= frameCount - 1) {
        // Last frame: show for duration then stop
        timerRef.current = setTimeout(() => {
          setIsPlaying(false);
        }, durationMs);
      } else {
        // Show frame for its duration, then switch to white
        timerRef.current = setTimeout(() => {
          setIsWhiteFrame(true);
        }, durationMs);
      }
    } else {
      const gapMs = intervals[currentIndex] ?? 1000;
      // Show white for gap duration, then advance
      timerRef.current = setTimeout(() => {
        setIsWhiteFrame(false);
        setCurrentIndex((prev) => prev + 1);
      }, gapMs);
    }

    return clearTimer;
  }, [isPlaying, currentIndex, isWhiteFrame, intervals, durations, frameCount, clearTimer]);

  return {
    currentIndex,
    isPlaying,
    isWhiteFrame,
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
