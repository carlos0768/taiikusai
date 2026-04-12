"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
  type PlaybackFrame,
  waveChangedColsAt,
} from "@/lib/grid/types";
import { usePlayback } from "@/components/playback/usePlayback";
import MusicTrack from "./MusicTrack";

const PX_PER_SECOND = 30;

interface PlaybackPanelProps {
  frames: PlaybackFrame[];
  onClose: () => void;
}

function frameThumbnailGrid(frame: PlaybackFrame): GridData {
  return frame.kind === "general" ? frame.grid : frame.before;
}

type PanelSize = "side" | "fullscreen";

function TimePopup({
  label,
  valueMs,
  onChange,
  onClose,
  anchorRect,
  position,
}: {
  label: string;
  valueMs: number;
  onChange: (ms: number) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  position: "above" | "below";
}) {
  const top =
    position === "above" ? anchorRect.top - 120 : anchorRect.bottom + 4;
  const left = anchorRect.left + anchorRect.width / 2 - 65;

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[70] bg-card border border-card-border rounded-lg shadow-xl p-3"
        style={{ top, left, width: 130 }}
      >
        <p className="text-xs text-muted mb-2 text-center">{label}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onChange(Math.max(200, valueMs - 100))}
            className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm active:bg-accent/30"
          >
            −
          </button>
          <span className="text-sm font-medium w-10 text-center">
            {(valueMs / 1000).toFixed(1)}
          </span>
          <button
            onClick={() => onChange(Math.min(10000, valueMs + 100))}
            className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm active:bg-accent/30"
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}

function FrameThumb({
  grid,
  isActive,
  durationMs,
  widthPx,
  onTap,
  onDurationChange,
  thumbRef,
  isWave,
}: {
  grid: GridData;
  isActive: boolean;
  durationMs: number;
  widthPx: number;
  onTap: () => void;
  onDurationChange: (ms: number) => void;
  thumbRef?: (el: HTMLDivElement | null) => void;
  isWave?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const thumbWidth = Math.max(40, widthPx);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = Math.max(40, Math.round(thumbWidth));
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
  }, [grid, thumbWidth]);

  return (
    <div ref={thumbRef ?? undefined} className="shrink-0 flex flex-col items-center" style={{ width: thumbWidth }}>
      <div className="relative" style={{ width: thumbWidth }}>
        <canvas
          ref={canvasRef}
          onClick={onTap}
          className={`rounded cursor-pointer transition-all ${
            isActive ? "ring-2 ring-accent scale-105" : "opacity-60 hover:opacity-100"
          }`}
          style={{ width: thumbWidth, imageRendering: "pixelated" }}
        />
        {isWave && (
          <span className="absolute top-0 left-0 text-[8px] px-1 bg-accent/80 text-black rounded-br">
            〜
          </span>
        )}
      </div>
      <button
        ref={btnRef}
        onClick={() => {
          if (isWave) return;
          if (btnRef.current) {
            setRect(btnRef.current.getBoundingClientRect());
            setShowPopup(true);
          }
        }}
        className={`text-[9px] mt-0.5 px-1.5 py-0.5 rounded transition-colors ${
          isActive ? "text-accent" : "text-muted hover:text-foreground"
        } ${isWave ? "cursor-default" : ""}`}
      >
        {(durationMs / 1000).toFixed(1)}s
      </button>
      {showPopup && rect && (
        <TimePopup
          label="表示時間（秒）"
          valueMs={durationMs}
          onChange={onDurationChange}
          onClose={() => setShowPopup(false)}
          anchorRect={rect}
          position="below"
        />
      )}
    </div>
  );
}

function GapButton({
  intervalMs,
  widthPx,
  isActive,
  onChange,
}: {
  intervalMs: number;
  widthPx: number;
  isActive: boolean;
  onChange: (ms: number) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const gapWidth = Math.max(20, widthPx);

  return (
    <div className="shrink-0 flex items-center justify-center" style={{ width: gapWidth }}>
      <button
        ref={btnRef}
        onClick={() => {
          if (btnRef.current) {
            setRect(btnRef.current.getBoundingClientRect());
            setShowPopup(true);
          }
        }}
        className={`min-w-5 h-7 px-1 flex items-center justify-center rounded-full text-[8px] transition-colors ${
          isActive
            ? "bg-accent/30 text-accent ring-1 ring-accent"
            : "bg-card-border/50 hover:bg-card-border text-muted hover:text-foreground"
        }`}
      >
        {(intervalMs / 1000).toFixed(1)}
      </button>
      {showPopup && rect && (
        <TimePopup
          label="折り時間（秒）"
          valueMs={intervalMs}
          onChange={onChange}
          onClose={() => setShowPopup(false)}
          anchorRect={rect}
          position="above"
        />
      )}
    </div>
  );
}

export default function PlaybackPanel({
  frames,
  onClose,
}: PlaybackPanelProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [panelSize, setPanelSize] = useState<PanelSize>("side");
  // Store the initial canvas size (from first render in "side" mode)
  const [fixedSize, setFixedSize] = useState<{ w: number; h: number } | null>(null);

  const {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    frameElapsedMs,
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
  } = usePlayback(frames);

  const handleMusicStateChange = useCallback(
    (playing: boolean) => {
      if (!playing) pause();
    },
    [pause]
  );

  // Auto-scroll timeline
  useEffect(() => {
    const el = frameRefs.current[currentIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex]);

  // Measure initial canvas size on first render
  useEffect(() => {
    if (fixedSize) return;
    const container = containerRef.current;
    if (!container || frames.length === 0) return;

    // Wait for layout to stabilize
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const grid = frameThumbnailGrid(frames[0]);
      const cellSize = Math.min(rect.width / grid.width, rect.height / grid.height);
      setFixedSize({
        w: grid.width * cellSize,
        h: grid.height * cellSize,
      });
    });
  }, [frames, fixedSize]);

  // Draw canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !fixedSize || frames.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const frame = frames[currentIndex];
    if (!frame) return;
    const baseGrid = frameThumbnailGrid(frame);

    // Use fixed size for side mode, recalculate for fullscreen
    let canvasW = fixedSize.w;
    let canvasH = fixedSize.h;

    if (panelSize === "fullscreen" && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cellSize = Math.min(
        rect.width / baseGrid.width,
        rect.height / baseGrid.height
      );
      canvasW = baseGrid.width * cellSize;
      canvasH = baseGrid.height * cellSize;
    }

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext("2d")!;
    const cellW = canvasW / baseGrid.width;
    const cellH = canvasH / baseGrid.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Grid background
    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Grid lines
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1;
    for (let x = 0; x <= baseGrid.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, canvasH);
      ctx.stroke();
    }
    for (let y = 0; y <= baseGrid.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(canvasW, y * cellH);
      ctx.stroke();
    }

    // Cell colors
    const pad = Math.max(1, cellW * 0.06);
    let displayGridFor: (x: number) => GridData;
    if (frame.kind === "general") {
      displayGridFor = () => frame.grid;
    } else {
      const changedCols = waveChangedColsAt(frame, frameElapsedMs);
      displayGridFor = (x: number) => (x < changedCols ? frame.after : frame.before);
    }
    for (let y = 0; y < baseGrid.height; y++) {
      for (let x = 0; x < baseGrid.width; x++) {
        if (isWhiteFrame) {
          ctx.fillStyle = "#FFFFFF";
        } else {
          const g = displayGridFor(x);
          ctx.fillStyle = COLOR_MAP[g.cells[y * g.width + x] as ColorIndex];
        }
        ctx.fillRect(
          x * cellW + pad,
          y * cellH + pad,
          cellW - pad * 2,
          cellH - pad * 2
        );
      }
    }
  }, [currentIndex, frames, frameElapsedMs, isWhiteFrame, fixedSize, panelSize]);

  return (
    <div
      className={`${
        panelSize === "fullscreen" ? "fixed inset-0 w-full z-50" : "w-[35vw]"
      } h-full bg-card border-l border-card-border flex flex-col shrink-0`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border shrink-0">
        <span className="text-sm font-medium truncate">
          {isWhiteFrame
            ? "（折り中）"
            : frames[currentIndex]?.name ?? `Frame ${currentIndex + 1}`}
          {frames[currentIndex]?.kind === "wave" && !isWhiteFrame && (
            <span className="ml-1 text-[10px] text-accent">〜WAVE</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted mr-2">
            {currentIndex + 1}/{frames.length}
          </span>
          <button
            onClick={() => setPanelSize(panelSize === "fullscreen" ? "side" : "fullscreen")}
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

      {/* Shared timeline scroll container */}
      <div className="overflow-x-auto border-t border-card-border shrink-0 py-2">
        {/* Music track */}
        <MusicTrack
          isPlaying={isPlaying}
          onPlayStateChange={handleMusicStateChange}
          pxPerSecond={PX_PER_SECOND}
        />

        {/* Frame timeline */}
        <div className="flex items-end gap-0 px-3 pb-1">
          {frames.map((frame, idx) => (
            <div key={idx} className="flex items-center shrink-0">
              <FrameThumb
                grid={frameThumbnailGrid(frame)}
                isActive={currentIndex === idx && !isWhiteFrame}
                durationMs={durations[idx] ?? 2000}
                widthPx={(durations[idx] ?? 2000) / 1000 * PX_PER_SECOND}
                onTap={() => { pause(); goTo(idx); }}
                onDurationChange={(ms) => setFrameDuration(idx, ms)}
                thumbRef={(el) => { frameRefs.current[idx] = el; }}
                isWave={frame.kind === "wave"}
              />
              {idx < frames.length - 1 && (
                <GapButton
                  intervalMs={intervals[idx] ?? 1000}
                  widthPx={(intervals[idx] ?? 1000) / 1000 * PX_PER_SECOND}
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
          <button onClick={stop} className="text-muted hover:text-foreground text-sm px-1">⏹</button>
          <button onClick={prev} className="text-muted hover:text-foreground text-sm px-1">⏮</button>
          <button
            onClick={isPlaying ? pause : play}
            className="w-10 h-10 flex items-center justify-center bg-accent text-black rounded-full text-lg hover:opacity-90"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button onClick={next} className="text-muted hover:text-foreground text-sm px-1">⏭</button>
        </div>
      </div>
    </div>
  );
}
