"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
  type PlaybackFrame,
  waveChangedColsAt,
} from "@/lib/grid/types";
import type { MusicData } from "@/types";
import {
  clampTimingMs,
  getTimingPersistenceErrorMessage,
  msToSecondsString,
} from "@/lib/playback/timing";
import {
  type PlaybackFrameItem,
  type PlaybackGapItem,
  type PlaybackTimeline,
} from "@/lib/playback/frameBuilder";
import { usePlayback } from "@/components/playback/usePlayback";
import MusicTrack from "./MusicTrack";

const PX_PER_SECOND = 30;

interface PlaybackPanelProps {
  projectId: string;
  branchId: string;
  timeline: PlaybackTimeline;
  onClose: () => void;
  initialMusic: MusicData | null;
  onMusicChange: (data: MusicData | null) => Promise<void> | void;
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
  canReset = false,
  onReset,
  isOverride = false,
  isSaving = false,
}: {
  label: string;
  valueMs: number;
  onChange: (ms: number) => Promise<void> | void;
  onClose: () => void;
  anchorRect: DOMRect;
  position: "above" | "below";
  canReset?: boolean;
  onReset?: () => Promise<void> | void;
  isOverride?: boolean;
  isSaving?: boolean;
}) {
  const top =
    position === "above" ? anchorRect.top - 160 : anchorRect.bottom + 4;
  const left = anchorRect.left + anchorRect.width / 2 - 82;

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[70] bg-card border border-card-border rounded-lg shadow-xl p-3"
        style={{ top, left, width: 164 }}
      >
        <p className="text-xs text-muted mb-1 text-center">{label}</p>
        <p className="text-[10px] text-center mb-2 text-muted">
          {isOverride ? "個別設定中" : "基本時間に追従中"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => void onChange(clampTimingMs(valueMs - 100))}
            disabled={isSaving}
            className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm active:bg-accent/30 disabled:opacity-40"
          >
            −
          </button>
          <span className="text-sm font-medium w-10 text-center">
            {msToSecondsString(valueMs)}
          </span>
          <button
            onClick={() => void onChange(clampTimingMs(valueMs + 100))}
            disabled={isSaving}
            className="w-7 h-7 flex items-center justify-center bg-card-border rounded text-foreground text-sm active:bg-accent/30 disabled:opacity-40"
          >
            +
          </button>
        </div>
        {canReset && onReset && (
          <button
            onClick={() => void onReset()}
            disabled={isSaving}
            className="mt-3 w-full px-2 py-1.5 text-xs rounded border border-card-border text-muted hover:text-foreground hover:border-accent/40 disabled:opacity-40"
          >
            基本に戻す
          </button>
        )}
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
  onDurationReset,
  thumbRef,
  isWave,
  isOverride,
  isSaving,
}: {
  grid: GridData;
  isActive: boolean;
  durationMs: number;
  widthPx: number;
  onTap: () => void;
  onDurationChange: (ms: number) => Promise<void> | void;
  onDurationReset?: () => Promise<void> | void;
  thumbRef?: (el: HTMLDivElement | null) => void;
  isWave?: boolean;
  isOverride?: boolean;
  isSaving?: boolean;
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
    <div
      ref={thumbRef ?? undefined}
      className="shrink-0 flex flex-col items-center"
      style={{ width: thumbWidth }}
    >
      <div className="relative" style={{ width: thumbWidth }}>
        <canvas
          ref={canvasRef}
          onClick={onTap}
          className={`rounded cursor-pointer transition-all ${
            isActive
              ? "ring-2 ring-accent scale-105"
              : "opacity-60 hover:opacity-100"
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
        className={`mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
          isActive ? "text-accent" : "text-muted hover:text-foreground"
        } ${isWave ? "cursor-default" : ""} ${
          isOverride ? "bg-accent/10 border border-accent/40" : ""
        }`}
      >
        <span className="text-[9px]">{msToSecondsString(durationMs)}s</span>
        {isOverride && <span className="text-[8px] text-accent">個別</span>}
      </button>
      {showPopup && rect && (
        <TimePopup
          label="表示時間（秒）"
          valueMs={durationMs}
          onChange={onDurationChange}
          onClose={() => setShowPopup(false)}
          anchorRect={rect}
          position="below"
          canReset={Boolean(isOverride && onDurationReset)}
          onReset={onDurationReset}
          isOverride={isOverride}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

function GapButton({
  intervalMs,
  widthPx,
  isActive,
  isOverride,
  isSaving,
  onChange,
  onReset,
}: {
  intervalMs: number;
  widthPx: number;
  isActive: boolean;
  isOverride: boolean;
  isSaving?: boolean;
  onChange: (ms: number) => Promise<void> | void;
  onReset?: () => Promise<void> | void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const gapWidth = Math.max(20, widthPx);

  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{ width: gapWidth }}
    >
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
        } ${isOverride ? "border border-accent/50" : ""}`}
      >
        {msToSecondsString(intervalMs)}
      </button>
      {showPopup && rect && (
        <TimePopup
          label="折り時間（秒）"
          valueMs={intervalMs}
          onChange={onChange}
          onClose={() => setShowPopup(false)}
          anchorRect={rect}
          position="above"
          canReset={isOverride && Boolean(onReset)}
          onReset={onReset}
          isOverride={isOverride}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

function updateFrameItemDuration(
  item: PlaybackFrameItem,
  durationMs: number,
  isDurationOverride: boolean
): PlaybackFrameItem {
  if (item.frame.kind !== "general") return item;
  return {
    ...item,
    durationMs,
    isDurationOverride,
    frame: {
      ...item.frame,
      durationMs,
    },
  };
}

export default function PlaybackPanel({
  projectId,
  branchId,
  timeline,
  onClose,
  initialMusic,
  onMusicChange,
}: PlaybackPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [panelSize, setPanelSize] = useState<PanelSize>("side");
  const [fixedSize, setFixedSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [frameItems, setFrameItems] = useState<PlaybackFrameItem[]>(
    timeline.frameItems
  );
  const [gapItems, setGapItems] = useState<PlaybackGapItem[]>(timeline.gapItems);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setFrameItems(timeline.frameItems);
    setGapItems(timeline.gapItems);
  }, [timeline]);

  const frames = useMemo(
    () => frameItems.map((item) => item.frame),
    [frameItems]
  );
  const durations = useMemo(
    () => frameItems.map((item) => item.durationMs),
    [frameItems]
  );
  const intervals = useMemo(
    () => gapItems.map((item) => item.intervalMs),
    [gapItems]
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
    goTo,
  } = usePlayback({ frames, durations, intervals });

  const handleMusicStateChange = useCallback(
    (playing: boolean) => {
      if (!playing) pause();
    },
    [pause]
  );

  const persistFrameDuration = useCallback(
    async (index: number, durationMs: number | null) => {
      const item = frameItems[index];
      if (!item || !item.isDurationEditable) return;
      const key = `frame:${item.zentaiGamenId}`;
      if (savingKey === key) return;

      const nextMs = durationMs ?? timeline.defaultPanelDurationMs;
      const prevItem = item;

      setSavingKey(key);
      setFrameItems((prev) =>
        prev.map((frameItem, frameIndex) =>
          frameIndex === index
            ? updateFrameItemDuration(
                frameItem,
                nextMs,
                durationMs !== null
              )
            : frameItem
        )
      );

      const { error } = await supabase
        .from("zentai_gamen")
        .update({
          panel_duration_override_ms: durationMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.zentaiGamenId)
        .eq("project_id", projectId)
        .eq("branch_id", branchId);

      if (error) {
        console.error("Failed to persist frame duration override", error);
        setFrameItems((prev) =>
          prev.map((frameItem, frameIndex) =>
            frameIndex === index ? prevItem : frameItem
          )
        );
        alert(getTimingPersistenceErrorMessage(error, "frame"));
      }

      setSavingKey((current) => (current === key ? null : current));
    },
    [
      branchId,
      frameItems,
      projectId,
      savingKey,
      supabase,
      timeline.defaultPanelDurationMs,
    ]
  );

  const persistGapDuration = useCallback(
    async (index: number, intervalMs: number | null) => {
      const item = gapItems[index];
      if (!item || !item.isIntervalEditable || !item.connectionId) return;
      const key = `gap:${item.connectionId}`;
      if (savingKey === key) return;

      const nextMs = intervalMs ?? timeline.defaultIntervalMs;
      const prevItem = item;

      setSavingKey(key);
      setGapItems((prev) =>
        prev.map((gapItem, gapIndex) =>
          gapIndex === index
            ? {
                ...gapItem,
                intervalMs: nextMs,
                isIntervalOverride: intervalMs !== null,
              }
            : gapItem
        )
      );

      const { error } = await supabase
        .from("connections")
        .update({ interval_override_ms: intervalMs })
        .eq("id", item.connectionId)
        .eq("project_id", projectId)
        .eq("branch_id", branchId);

      if (error) {
        console.error("Failed to persist gap duration override", error);
        setGapItems((prev) =>
          prev.map((gapItem, gapIndex) =>
            gapIndex === index ? prevItem : gapItem
          )
        );
        alert(getTimingPersistenceErrorMessage(error, "gap"));
      }

      setSavingKey((current) => (current === key ? null : current));
    },
    [branchId, gapItems, projectId, savingKey, supabase, timeline.defaultIntervalMs]
  );

  useEffect(() => {
    const el = frameRefs.current[currentIndex];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentIndex]);

  useEffect(() => {
    if (fixedSize) return;
    const container = containerRef.current;
    if (!container || frames.length === 0) return;

    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const grid = frameThumbnailGrid(frames[0]);
      const cellSize = Math.min(
        rect.width / grid.width,
        rect.height / grid.height
      );
      setFixedSize({
        w: grid.width * cellSize,
        h: grid.height * cellSize,
      });
    });
  }, [frames, fixedSize]);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !fixedSize || frames.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const frame = frames[currentIndex];
    if (!frame) return;
    const baseGrid = frameThumbnailGrid(frame);

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

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cellW = canvasW / baseGrid.width;
    const cellH = canvasH / baseGrid.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#222222";
    ctx.fillRect(0, 0, canvasW, canvasH);

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

    const pad = Math.max(1, cellW * 0.06);
    let displayGridFor: (x: number) => GridData;
    if (frame.kind === "general") {
      displayGridFor = () => frame.grid;
    } else {
      const changedCols = waveChangedColsAt(frame, frameElapsedMs);
      displayGridFor = (x: number) =>
        x < changedCols ? frame.after : frame.before;
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
  }, [currentIndex, fixedSize, frameElapsedMs, frames, isWhiteFrame, panelSize]);

  return (
    <div
      className={`${
        panelSize === "fullscreen" ? "fixed inset-0 w-full z-50" : "w-[35vw]"
      } h-full bg-card border-l border-card-border flex flex-col shrink-0`}
    >
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

      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 overflow-hidden"
      >
        <canvas ref={mainCanvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      <div className="overflow-x-auto border-t border-card-border shrink-0 py-2">
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted">
            個別設定していない表示時間と折り時間は、プロジェクト設定の基本時間に追従します。
          </p>
        </div>

        <MusicTrack
          isPlaying={isPlaying}
          onPlayStateChange={handleMusicStateChange}
          pxPerSecond={PX_PER_SECOND}
          projectId={projectId}
          initialMusic={initialMusic}
          onMusicChange={onMusicChange}
        />

        <div className="flex items-end gap-0 px-3 pb-1">
          {frameItems.map((frameItem, idx) => (
            <div key={frameItem.zentaiGamenId} className="flex items-center shrink-0">
              <FrameThumb
                grid={frameThumbnailGrid(frameItem.frame)}
                isActive={currentIndex === idx && !isWhiteFrame}
                durationMs={frameItem.durationMs}
                widthPx={(frameItem.durationMs / 1000) * PX_PER_SECOND}
                onTap={() => {
                  pause();
                  goTo(idx);
                }}
                onDurationChange={(ms) => persistFrameDuration(idx, ms)}
                onDurationReset={() => persistFrameDuration(idx, null)}
                thumbRef={(el) => {
                  frameRefs.current[idx] = el;
                }}
                isWave={frameItem.frame.kind === "wave"}
                isOverride={frameItem.isDurationOverride}
                isSaving={savingKey === `frame:${frameItem.zentaiGamenId}`}
              />
              {idx < gapItems.length && (
                <GapButton
                  intervalMs={gapItems[idx].intervalMs}
                  widthPx={(gapItems[idx].intervalMs / 1000) * PX_PER_SECOND}
                  isActive={isWhiteFrame && currentIndex === idx}
                  isOverride={gapItems[idx].isIntervalOverride}
                  isSaving={
                    gapItems[idx].connectionId !== null &&
                    savingKey === `gap:${gapItems[idx].connectionId}`
                  }
                  onChange={(ms) => persistGapDuration(idx, ms)}
                  onReset={() => persistGapDuration(idx, null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

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
