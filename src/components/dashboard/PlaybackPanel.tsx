"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { usePlayback } from "@/components/playback/usePlayback";

interface PlaybackPanelProps {
  frames: GridData[];
  frameNames: string[];
  onClose: () => void;
}

type PanelSize = "side" | "fullscreen";

// Fixed-position popup for editing time values
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

// Frame thumbnail
function FrameThumb({
  grid,
  isActive,
  durationMs,
  onTap,
  onDurationChange,
  thumbRef,
}: {
  grid: GridData;
  isActive: boolean;
  durationMs: number;
  onTap: () => void;
  onDurationChange: (ms: number) => void;
  thumbRef?: (el: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

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
    <div ref={thumbRef ?? undefined} className="shrink-0 flex flex-col items-center">
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
      <button
        ref={btnRef}
        onClick={() => {
          if (btnRef.current) {
            setRect(btnRef.current.getBoundingClientRect());
            setShowPopup(true);
          }
        }}
        className={`text-[9px] mt-0.5 px-1.5 py-0.5 rounded transition-colors ${
          isActive ? "text-accent" : "text-muted hover:text-foreground"
        }`}
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

// Gap button
function GapButton({
  intervalMs,
  isActive,
  onChange,
}: {
  intervalMs: number;
  isActive: boolean;
  onChange: (ms: number) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  return (
    <div className="shrink-0 flex items-center mx-0.5">
      <button
        ref={btnRef}
        onClick={() => {
          if (btnRef.current) {
            setRect(btnRef.current.getBoundingClientRect());
            setShowPopup(true);
          }
        }}
        className={`w-7 h-7 flex items-center justify-center rounded-full text-[8px] transition-colors ${
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
  frameNames,
  onClose,
}: PlaybackPanelProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [panelSize, setPanelSize] = useState<PanelSize>("side");
  const canvasSizeRef = useRef<{ w: number; h: number } | null>(null);

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

  // Auto-scroll timeline to keep current frame visible
  useEffect(() => {
    const el = frameRefs.current[currentIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex]);

  // Set canvas size once on mount
  const [canvasReady, setCanvasReady] = useState(false);
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;
    if (canvasSizeRef.current) return;

    const dpr = window.devicePixelRatio || 1;
    const grid = frames[0];
    const rect = container.getBoundingClientRect();
    const cellSize = Math.min(
      rect.width / grid.width,
      rect.height / grid.height
    );
    const canvasW = grid.width * cellSize;
    const canvasH = grid.height * cellSize;
    canvasSizeRef.current = { w: canvasW, h: canvasH };

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    setCanvasReady(true);
  }, [frames, panelSize]);

  // Draw canvas content — never change canvas size
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !canvasSizeRef.current || frames.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const grid = frames[currentIndex];
    const { w: canvasW, h: canvasH } = canvasSizeRef.current;
    const ctx = canvas.getContext("2d")!;

    // Draw grid structure
    const cellW = canvasW / grid.width;
    const cellH = canvasH / grid.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1;
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

    // Draw colors
    const pad = Math.max(1, cellW * 0.06);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (isWhiteFrame) {
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
  }, [currentIndex, frames, isWhiteFrame, canvasReady]);

  // Reset canvas size when panel size changes
  useEffect(() => {
    canvasSizeRef.current = null;
    setCanvasReady(false);
  }, [panelSize]);

  return (
    <div
      className={`${
        panelSize === "fullscreen"
          ? "fixed inset-0 w-full z-50"
          : "w-[35vw]"
      } h-full bg-card border-l border-card-border flex flex-col shrink-0`}
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
          <button
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main canvas — fixed size, no resize on playback */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden"
      >
        <canvas ref={mainCanvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {/* Frame timeline + fullscreen button */}
      <div className="px-3 py-2 border-t border-card-border shrink-0">
        <div className="flex items-end gap-0">
          <div
            ref={timelineRef}
            className="flex items-end gap-0 overflow-x-auto pb-1 flex-1"
          >
            {frames.map((frame, idx) => (
              <div key={idx} className="flex items-center shrink-0">
                <FrameThumb
                  grid={frame}
                  isActive={currentIndex === idx && !isWhiteFrame}
                  durationMs={durations[idx] ?? 2000}
                  onTap={() => {
                    pause();
                    goTo(idx);
                  }}
                  onDurationChange={(ms) => setFrameDuration(idx, ms)}
                  thumbRef={(el: HTMLDivElement | null) => {
                    frameRefs.current[idx] = el;
                  }}
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

          {/* Fullscreen toggle */}
          <button
            onClick={() =>
              setPanelSize(panelSize === "fullscreen" ? "side" : "fullscreen")
            }
            className="ml-2 mb-1 w-7 h-7 flex items-center justify-center rounded bg-card-border/50 hover:bg-card-border text-muted hover:text-foreground text-xs shrink-0"
            title={panelSize === "fullscreen" ? "縮小" : "全画面"}
          >
            {panelSize === "fullscreen" ? "⊡" : "⊞"}
          </button>
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
