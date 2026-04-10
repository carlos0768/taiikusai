"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { usePlayback } from "@/components/playback/usePlayback";

interface PlaybackPanelProps {
  frames: GridData[];
  frameNames: string[];
  onClose: () => void;
}

type PanelSize = "side" | "expanded" | "fullscreen";

export default function PlaybackPanel({
  frames,
  frameNames,
  onClose,
}: PlaybackPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>("side");

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

  // Render current frame
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const grid = frames[currentIndex];
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const cellSize = Math.min(rect.width / grid.width, rect.height / grid.height);
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
  }, [currentIndex, frames, panelSize]);

  const sizeClasses: Record<PanelSize, string> = {
    side: "w-[35vw]",
    expanded: "w-[60vw]",
    fullscreen: "fixed inset-0 w-full z-50",
  };

  return (
    <div
      className={`${sizeClasses[panelSize]} h-full bg-card border-l border-card-border flex flex-col shrink-0 transition-all duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border shrink-0">
        <span className="text-sm font-medium truncate">
          {frameNames[currentIndex] ?? `Frame ${currentIndex + 1}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted mr-2">
            {currentIndex + 1}/{frames.length}
          </span>
          {panelSize !== "side" && (
            <button
              onClick={() => setPanelSize("side")}
              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
              title="縮小"
            >
              ◁
            </button>
          )}
          {panelSize !== "expanded" && panelSize !== "fullscreen" && (
            <button
              onClick={() => setPanelSize("expanded")}
              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
              title="拡張"
            >
              ▷
            </button>
          )}
          <button
            onClick={() =>
              setPanelSize(panelSize === "fullscreen" ? "side" : "fullscreen")
            }
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
            title={panelSize === "fullscreen" ? "全画面解除" : "全画面"}
          >
            {panelSize === "fullscreen" ? "⊡" : "⊞"}
          </button>
          <button
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
            title="閉じる"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Canvas area with padding */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden"
      >
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1 px-3 py-1 flex-wrap shrink-0">
        {frames.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              pause();
              goTo(idx);
            }}
            className={`w-2 h-2 rounded-full transition-colors ${
              idx === currentIndex
                ? "bg-accent"
                : idx < currentIndex
                  ? "bg-accent/40"
                  : "bg-card-border"
            }`}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="px-3 py-3 border-t border-card-border space-y-2 shrink-0">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={stop}
            className="text-muted hover:text-foreground text-sm px-1"
          >
            ⏹
          </button>
          <button
            onClick={prev}
            className="text-muted hover:text-foreground text-sm px-1"
          >
            ⏮
          </button>
          <button
            onClick={isPlaying ? pause : play}
            className="w-10 h-10 flex items-center justify-center bg-accent text-black rounded-full text-lg hover:opacity-90"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            onClick={next}
            className="text-muted hover:text-foreground text-sm px-1"
          >
            ⏭
          </button>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-muted">速度</span>
          <input
            type="range"
            min={500}
            max={5000}
            step={100}
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="w-24 accent-accent"
          />
          <span className="text-xs text-muted w-10">
            {(intervalMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}
