"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlayback(frameCount: number) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWhiteFrame, setIsWhiteFrame] = useState(false);
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

  const setInterval_ = useCallback(
    (index: number, ms: number) => {
      setIntervals((prev) => {
        const next = [...prev];
        if (index >= 0 && index < next.length) {
          next[index] = ms;
        }
        return next;
      });
    },
    []
  );

  // Playback loop with white frame insertion
  useEffect(() => {
    if (!isPlaying) return;

    if (currentIndex >= frameCount - 1) {
      setIsPlaying(false);
      return;
    }

    const gapMs = intervals[currentIndex] ?? 1000;

    if (!isWhiteFrame) {
      // Show current frame for a base duration (500ms), then show white
      timerRef.current = setTimeout(() => {
        setIsWhiteFrame(true);
      }, 500);
    } else {
      // Show white frame for the gap duration, then advance
      timerRef.current = setTimeout(() => {
        setIsWhiteFrame(false);
        setCurrentIndex((prev) => prev + 1);
      }, gapMs);
    }

    return clearTimer;
  }, [isPlaying, currentIndex, isWhiteFrame, intervals, frameCount, clearTimer]);

  return {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    intervals,
    setInterval: setInterval_,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  };
}
