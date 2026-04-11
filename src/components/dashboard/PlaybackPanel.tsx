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

// Small thumbnail renderer
function FrameThumb({
  grid,
  isActive,
  onClick,
}: {
  grid: GridData;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        ctx.fillRect(
          x * cellW,
          y * cellH,
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      }
    }
  }, [grid]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className={`shrink-0 rounded cursor-pointer transition-all ${
        isActive
          ? "ring-2 ring-accent scale-105"
          : "opacity-60 hover:opacity-100"
      }`}
      style={{ width: 60, imageRendering: "pixelated" }}
    />
  );
}

// Gap interval button + popup
function GapButton({
  intervalMs,
  onChange,
}: {
  intervalMs: number;
  onChange: (ms: number) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative shrink-0 flex items-center">
      <button
        ref={btnRef}
        onClick={() => setShowPopup(!showPopup)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-card-border/50 hover:bg-card-border text-[8px] text-muted hover:text-foreground transition-colors"
        title="間隔時間"
      >
        {(intervalMs / 1000).toFixed(1)}
      </button>

      {showPopup && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-card border border-card-border rounded-lg shadow-xl p-3 z-50 min-w-[140px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-muted mb-2 text-center">
            折り時間（秒）
          </p>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={intervalMs}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <p className="text-center text-sm font-medium mt-1">
            {(intervalMs / 1000).toFixed(1)}s
          </p>
          <button
            onClick={() => setShowPopup(false)}
            className="w-full mt-2 text-xs text-muted hover:text-foreground text-center"
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
    setInterval: setGapInterval,
    play,
    pause,
    stop,
    next,
    prev,
    goTo,
  } = usePlayback(frames.length);

  // Render main canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const grid = frames[currentIndex];

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

    if (isWhiteFrame) {
      // All white during fold transition
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
          ctx.fillStyle = COLOR_MAP[colorIdx];
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
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

      {/* Main canvas */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden"
      >
        <canvas
          ref={mainCanvasRef}
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Frame timeline */}
      <div className="px-3 py-2 border-t border-card-border shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {frames.map((frame, idx) => (
            <div key={idx} className="flex items-center shrink-0">
              <FrameThumb
                grid={frame}
                isActive={currentIndex === idx && !isWhiteFrame}
                onClick={() => {
                  pause();
                  goTo(idx);
                }}
              />
              {idx < frames.length - 1 && (
                <GapButton
                  intervalMs={intervals[idx] ?? 1000}
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
