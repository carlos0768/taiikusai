"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { usePlayback } from "@/components/playback/usePlayback";

interface PlaybackPanelProps {
  frames: GridData[];
  frameNames: string[];
  onClose: () => void;
}

type PanelSize = "side" | "expanded" | "fullscreen";

// Frame thumbnail with duration popup
function FrameThumb({
  grid,
  name,
  isActive,
  durationMs,
  onTap,
  onDurationChange,
}: {
  grid: GridData;
  name: string;
  isActive: boolean;
  durationMs: number;
  onTap: () => void;
  onDurationChange: (ms: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 60;
    const h = Math.round((grid.height / grid.width) * w);
    canvas.width = w;
    canvas.height = h;
    const cellW = w / grid.width;
    const cellH = h / grid.height;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const idx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[idx];
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [grid]);

  return (
    <div className="relative shrink-0 flex flex-col items-center">
      <canvas
        ref={canvasRef}
        onClick={onTap}
        className={`rounded cursor-pointer transition-all ${
          isActive
            ? "ring-2 ring-accent scale-105"
            : "opacity-60 hover:opacity-100"
        }`}
        style={{ width: 60, imageRendering: "pixelated" }}
      />
      {/* Duration label — tap to edit */}
      <button
        onClick={() => setShowPopup(!showPopup)}
        className={`text-[7px] mt-0.5 px-1 rounded transition-colors ${
          isActive ? "text-accent" : "text-muted hover:text-foreground"
        }`}
      >
        {(durationMs / 1000).toFixed(1)}s
      </button>

      {showPopup && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-card border border-card-border rounded-lg shadow-xl p-3 z-50 min-w-[130px]">
          <p className="text-xs text-muted mb-2 text-center">表示時間（秒）</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onDurationChange(Math.max(200, durationMs - 100))}
              className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm"
            >
              −
            </button>
            <span className="text-sm font-medium w-10 text-center">
              {(durationMs / 1000).toFixed(1)}
            </span>
            <button
              onClick={() => onDurationChange(Math.min(10000, durationMs + 100))}
              className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setShowPopup(false)}
            className="w-full mt-2 text-[10px] text-muted hover:text-foreground text-center"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

// Gap interval button + popup (with active highlight)
function GapButton({
  intervalMs,
  isActive,
  onChange,
}: {
  intervalMs: number;
  isActive: boolean;
  onChange: (ms: number) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <div className="relative shrink-0 flex items-center mx-0.5">
      <button
        onClick={() => setShowPopup(!showPopup)}
        className={`w-6 h-6 flex items-center justify-center rounded-full text-[8px] transition-colors ${
          isActive
            ? "bg-accent/30 text-accent ring-1 ring-accent"
            : "bg-card-border/50 hover:bg-card-border text-muted hover:text-foreground"
        }`}
        title="折り時間"
      >
        {(intervalMs / 1000).toFixed(1)}
      </button>

      {showPopup && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-card border border-card-border rounded-lg shadow-xl p-3 z-50 min-w-[130px]">
          <p className="text-xs text-muted mb-2 text-center">折り時間（秒）</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onChange(Math.max(200, intervalMs - 100))}
              className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm"
            >
              −
            </button>
            <span className="text-sm font-medium w-10 text-center">
              {(intervalMs / 1000).toFixed(1)}
            </span>
            <button
              onClick={() => onChange(Math.min(10000, intervalMs + 100))}
              className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setShowPopup(false)}
            className="w-full mt-2 text-[10px] text-muted hover:text-foreground text-center"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

export default function PlaybackPanel({
  frames,
  frameNames,
  onClose,
}: PlaybackPanelProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>("side");

  const {
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
  } = usePlayback(frames.length);

  const gridDrawnRef = useRef(false);
  const lastSizeRef = useRef({ w: 0, h: 0 });

  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    gridW: number,
    gridH: number,
    dpr: number
  ) => {
    const cellW = canvasW / gridW;
    const cellH = canvasH / gridH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1;
    for (let x = 0; x <= gridW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, canvasH);
      ctx.stroke();
    }
    for (let y = 0; y <= gridH; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(canvasW, y * cellH);
      ctx.stroke();
    }
  };

  const drawColors = (
    ctx: CanvasRenderingContext2D,
    grid: GridData,
    canvasW: number,
    canvasH: number,
    dpr: number,
    white: boolean
  ) => {
    const cellW = canvasW / grid.width;
    const cellH = canvasH / grid.height;
    const pad = Math.max(1, cellW * 0.06);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (white) {
          ctx.fillStyle = "#FFFFFF";
        } else {
          const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
          ctx.fillStyle = COLOR_MAP[colorIdx];
        }
        ctx.fillRect(
          x * cellW + pad,
          y * cellH + pad,
          cellW - pad * 2,
          cellH - pad * 2
        );
      }
    }
  };

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const grid = frames[currentIndex];

    const cellSize = Math.min(rect.width / grid.width, rect.height / grid.height);
    const canvasW = grid.width * cellSize;
    const canvasH = grid.height * cellSize;

    const ctx = canvas.getContext("2d")!;

    const sizeChanged =
      lastSizeRef.current.w !== canvasW || lastSizeRef.current.h !== canvasH;
    if (sizeChanged || !gridDrawnRef.current) {
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      canvas.style.width = `${canvasW}px`;
      canvas.style.height = `${canvasH}px`;
      lastSizeRef.current = { w: canvasW, h: canvasH };
      drawGrid(ctx, canvasW, canvasH, grid.width, grid.height, dpr);
      gridDrawnRef.current = true;
    }

    drawColors(ctx, grid, canvasW, canvasH, dpr, isWhiteFrame);
  }, [currentIndex, frames, panelSize, isWhiteFrame]);

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
          {isWhiteFrame
            ? "（折り中）"
            : frameNames[currentIndex] ?? `Frame ${currentIndex + 1}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted mr-2">
            {currentIndex + 1}/{frames.length}
          </span>
          {panelSize !== "side" && (
            <button
              onClick={() => setPanelSize("side")}
              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
            >
              ◁
            </button>
          )}
          {panelSize !== "expanded" && panelSize !== "fullscreen" && (
            <button
              onClick={() => setPanelSize("expanded")}
              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
            >
              ▷
            </button>
          )}
          <button
            onClick={() =>
              setPanelSize(panelSize === "fullscreen" ? "side" : "fullscreen")
            }
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
          >
            {panelSize === "fullscreen" ? "⊡" : "⊞"}
          </button>
          <button
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main canvas */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden"
      >
        <canvas ref={mainCanvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {/* Frame timeline */}
      <div className="px-3 py-2 border-t border-card-border shrink-0">
        <div className="flex items-end gap-0 overflow-x-auto pb-1">
          {frames.map((frame, idx) => (
            <div key={idx} className="flex items-center shrink-0">
              <FrameThumb
                grid={frame}
                name={frameNames[idx] ?? `${idx + 1}`}
                isActive={currentIndex === idx && !isWhiteFrame}
                durationMs={durations[idx] ?? 500}
                onTap={() => {
                  pause();
                  goTo(idx);
                }}
                onDurationChange={(ms) => setFrameDuration(idx, ms)}
              />
              {idx < frames.length - 1 && (
                <GapButton
                  intervalMs={intervals[idx] ?? 1000}
                  isActive={isWhiteFrame && currentIndex === idx}
                  onChange={(ms) => setGapInterval(idx, ms)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="px-3 py-3 border-t border-card-border shrink-0">
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
      </div>
    </div>
  );
}
