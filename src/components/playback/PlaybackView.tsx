"use client";

import { useCallback, useEffect, useRef } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { usePlayback } from "./usePlayback";

interface PlaybackViewProps {
  frames: GridData[];
  frameNames: string[];
  onBack: () => void;
  highlightedCell?: { x: number; y: number } | null;
  showControls?: boolean;
  autoPlay?: boolean;
  onCurrentIndexChange?: (index: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  seekIndex?: number | null;
  seekSignal?: number;
  playbackAction?: "play" | "pause" | "toggle" | "stop" | null;
  playbackSignal?: number;
}

export default function PlaybackView({
  frames,
  frameNames,
  onBack,
  highlightedCell = null,
  showControls = true,
  autoPlay = false,
  onCurrentIndexChange,
  onPlayingChange,
  seekIndex = null,
  seekSignal = 0,
  playbackAction = null,
  playbackSignal = 0,
}: PlaybackViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const {
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
  } = usePlayback(frames.length);

  useEffect(() => {
    if (autoPlay) {
      play();
    }
  }, [autoPlay, play]);

  useEffect(() => {
    onCurrentIndexChange?.(currentIndex);
  }, [currentIndex, onCurrentIndexChange]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    if (seekIndex === null) return;
    goTo(seekIndex);
  }, [goTo, seekIndex, seekSignal]);

  useEffect(() => {
    if (!playbackAction) return;

    if (playbackAction === "play") {
      play();
    } else if (playbackAction === "pause") {
      pause();
    } else if (playbackAction === "stop") {
      stop();
    } else if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play, playbackAction, playbackSignal, stop]);

  const renderCurrentFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const grid = frames[Math.min(currentIndex, frames.length - 1)];
    const styles = window.getComputedStyle(container);
    const availableWidth =
      container.clientWidth -
      Number.parseFloat(styles.paddingLeft || "0") -
      Number.parseFloat(styles.paddingRight || "0");
    const availableHeight =
      container.clientHeight -
      Number.parseFloat(styles.paddingTop || "0") -
      Number.parseFloat(styles.paddingBottom || "0");

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;

    const cellSize = Math.min(
      availableWidth / grid.width,
      availableHeight / grid.height
    );
    const canvasW = grid.width * cellSize;
    const canvasH = grid.height * cellSize;

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = canvasW / grid.width;
    const cellH = canvasH / grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[colorIdx];
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(128, 128, 128, 0.15)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= grid.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, canvasH);
      ctx.stroke();
    }
    for (let y = 0; y <= grid.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(canvasW, y * cellH);
      ctx.stroke();
    }

    if (
      highlightedCell &&
      highlightedCell.x >= 0 &&
      highlightedCell.x < grid.width &&
      highlightedCell.y >= 0 &&
      highlightedCell.y < grid.height
    ) {
      const lineWidth = Math.max(3, Math.min(cellW, cellH) * 0.16);
      const inset = lineWidth / 2;
      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(
        highlightedCell.x * cellW + inset,
        highlightedCell.y * cellH + inset,
        Math.max(0, cellW - lineWidth),
        Math.max(0, cellH - lineWidth)
      );
      ctx.restore();
    }
  }, [currentIndex, frames, highlightedCell]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderCurrentFrame();
    });
  }, [renderCurrentFrame]);

  useEffect(() => {
    scheduleRender();
  }, [scheduleRender]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      scheduleRender();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scheduleRender]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-card-border">
        <button
          onClick={onBack}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <span className="text-sm font-medium">
          {frameNames[currentIndex] ?? `Frame ${currentIndex + 1}`}
        </span>
        <span className="text-xs text-muted">
          {currentIndex + 1} / {frames.length}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {showControls && (
        <div className="shrink-0 px-4 py-3 border-t border-card-border space-y-3">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {frames.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  pause();
                  // Direct set through goTo equivalent
                }}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  idx === currentIndex
                    ? "bg-accent"
                    : idx < currentIndex
                      ? "bg-accent/40"
                      : "bg-card-border"
                }`}
              />
            ))}
          </div>

          {/* Playback buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={stop}
              className="text-muted hover:text-foreground transition-colors px-2 py-1"
            >
              ⏹
            </button>
            <button
              onClick={prev}
              className="text-muted hover:text-foreground transition-colors px-2 py-1 text-lg"
            >
              ⏮
            </button>
            <button
              onClick={isPlaying ? pause : play}
              className="w-12 h-12 flex items-center justify-center bg-accent text-black rounded-full text-xl hover:opacity-90 transition-opacity"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              onClick={next}
              className="text-muted hover:text-foreground transition-colors px-2 py-1 text-lg"
            >
              ⏭
            </button>
          </div>

          {/* Speed control */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-xs text-muted">速度</span>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="w-40 accent-accent"
            />
            <span className="text-xs text-muted w-12">
              {(intervalMs / 1000).toFixed(1)}秒
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
