"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
  type PlaybackFrame,
  getPlaybackFrameBaseGrid,
  waveChangedColsAt,
} from "@/lib/grid/types";
import type { PlaybackTimeline } from "@/lib/playback/frameBuilder";
import { msToSecondsString } from "@/lib/playback/timing";
import { usePlayback } from "./usePlayback";

interface PlaybackViewProps {
  timeline: PlaybackTimeline;
  onBack: () => void;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridData,
  canvasW: number,
  canvasH: number
) {
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
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  frame: Extract<PlaybackFrame, { kind: "wave" }>,
  elapsedMs: number,
  canvasW: number,
  canvasH: number
) {
  const { before, after } = frame;
  const cellW = canvasW / before.width;
  const cellH = canvasH / before.height;
  const changedCols = waveChangedColsAt(frame, elapsedMs);
  for (let y = 0; y < before.height; y++) {
    for (let x = 0; x < before.width; x++) {
      const grid = x < changedCols ? after : before;
      const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
      ctx.fillStyle = COLOR_MAP[colorIdx];
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }
  ctx.strokeStyle = "rgba(128, 128, 128, 0.15)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= before.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellW, 0);
    ctx.lineTo(x * cellW, canvasH);
    ctx.stroke();
  }
  for (let y = 0; y <= before.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellH);
    ctx.lineTo(canvasW, y * cellH);
    ctx.stroke();
  }
}

function frameDimensions(frame: PlaybackFrame): { width: number; height: number } {
  const grid = getPlaybackFrameBaseGrid(frame);
  return { width: grid.width, height: grid.height };
}

export default function PlaybackView({ timeline, onBack }: PlaybackViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frames = useMemo(
    () => timeline.frameItems.map((item) => item.frame),
    [timeline.frameItems]
  );
  const durations = useMemo(
    () => timeline.frameItems.map((item) => item.durationMs),
    [timeline.frameItems]
  );
  const intervals = useMemo(
    () => timeline.gapItems.map((item) => item.intervalMs),
    [timeline.gapItems]
  );

  const {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    frameElapsedMs,
    play,
    pause,
    stop,
    next,
    prev,
  } = usePlayback({ frames, durations, intervals });

  // Render current frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const frame = frames[currentIndex];
    if (!frame) return;
    const activeTransitionGrid = isWhiteFrame
      ? timeline.gapItems[currentIndex]?.transitionGrid ?? null
      : null;
    const dims = activeTransitionGrid
      ? { width: activeTransitionGrid.width, height: activeTransitionGrid.height }
      : frameDimensions(frame);
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const cellSize = Math.min(rect.width / dims.width, rect.height / dims.height);
    const canvasW = dims.width * cellSize;
    const canvasH = dims.height * cellSize;

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (isWhiteFrame && activeTransitionGrid) {
      drawGrid(ctx, activeTransitionGrid, canvasW, canvasH);
      return;
    }

    if (isWhiteFrame) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvasW, canvasH);
      return;
    }

    if (frame.kind === "general") {
      drawGrid(ctx, frame.grid, canvasW, canvasH);
    } else if (frame.kind === "keep") {
      drawGrid(ctx, frame.displayGrid, canvasW, canvasH);
    } else {
      drawWave(ctx, frame, frameElapsedMs, canvasW, canvasH);
    }
  }, [currentIndex, frames, frameElapsedMs, isWhiteFrame, timeline.gapItems]);

  const currentFrame = frames[currentIndex];
  const headerName = isWhiteFrame
    ? timeline.gapItems[currentIndex]?.transitionKind === "keep"
      ? "（keep中）"
      : "（折り中）"
    : currentFrame?.name ?? `Frame ${currentIndex + 1}`;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-card-border">
        <button
          onClick={onBack}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <span className="text-sm font-medium">
          {headerName}
          {currentFrame?.kind === "keep" && !isWhiteFrame && (
            <span className="ml-1 text-[10px] text-accent">KEEP</span>
          )}
          {currentFrame?.kind === "wave" && !isWhiteFrame && (
            <span className="ml-1 text-[10px] text-accent">〜WAVE</span>
          )}
        </span>
        <span className="text-xs text-muted">
          {currentIndex + 1} / {frames.length}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-card-border space-y-3">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {frames.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                pause();
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

        <div className="text-center text-[11px] text-muted">
          通常パネル基本 {msToSecondsString(timeline.defaultPanelDurationMs)}秒 / 折り基本{" "}
          {msToSecondsString(timeline.defaultIntervalMs)}秒
        </div>
      </div>
    </div>
  );
}
