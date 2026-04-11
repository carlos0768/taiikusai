"use client";

import { useEffect, useRef } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { usePlayback } from "./usePlayback";

interface PlaybackViewProps {
  frames: GridData[];
  frameNames: string[];
  onBack: () => void;
}

export default function PlaybackView({
  frames,
  frameNames,
  onBack,
}: PlaybackViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    intervals,
    setInterval: setGapInterval,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  } = usePlayback(frames.length);

  // Render current frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const grid = frames[currentIndex];
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Fit grid to container
    const cellSize = Math.min(
      rect.width / grid.width,
      rect.height / grid.height
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
  }, [currentIndex, frames]);

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
          {frameNames[currentIndex] ?? `Frame ${currentIndex + 1}`}
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

        {/* Speed control — sets all intervals uniformly */}
        <div className="flex items-center justify-center gap-3">
          <span className="text-xs text-muted">折り時間</span>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={intervals[0] ?? 1000}
            onChange={(e) => {
              const ms = Number(e.target.value);
              for (let i = 0; i < intervals.length; i++) {
                setGapInterval(i, ms);
              }
            }}
            className="w-40 accent-accent"
          />
          <span className="text-xs text-muted w-12">
            {((intervals[0] ?? 1000) / 1000).toFixed(1)}秒
          </span>
        </div>
      </div>
    </div>
  );
}
