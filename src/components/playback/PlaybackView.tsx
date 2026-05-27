"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
} from "react";
import {
  COLOR_MAP,
  UNDEFINED_COLOR,
  type ColorIndex,
  type GridData,
  type PlaybackFrame,
  getPlaybackFrameBaseGrid,
  waveChangedColsAt,
} from "@/lib/grid/types";
import type { PlaybackTimeline } from "@/lib/playback/frameBuilder";
import { msToSecondsString } from "@/lib/playback/timing";
import type { MusicData } from "@/types";
import { usePlayback } from "./usePlayback";
import { createMasterClock } from "./masterClock";

interface PlaybackViewProps {
  timeline: PlaybackTimeline;
  onBack: () => void;
  musicData?: MusicData | null;
  showBackButton?: boolean;
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

export interface PlaybackViewHandle {
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  toggle(): Promise<void>;
  goTo(index: number): void;
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

interface YouTubeWindow {
  YT?: {
    Player: new (
      element: HTMLElement,
      config: {
        height: string;
        width: string;
        videoId: string;
        playerVars?: Record<string, number | string>;
        events?: {
          onReady?: (event: { target: YTPlayer }) => void;
        };
      }
    ) => YTPlayer;
  };
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

function drawCellHighlight(
  ctx: CanvasRenderingContext2D,
  dims: { width: number; height: number },
  canvasW: number,
  canvasH: number,
  highlightedCell: { x: number; y: number } | null
) {
  if (!highlightedCell) return;
  if (
    highlightedCell.x < 0 ||
    highlightedCell.x >= dims.width ||
    highlightedCell.y < 0 ||
    highlightedCell.y >= dims.height
  ) {
    return;
  }

  const cellW = canvasW / dims.width;
  const cellH = canvasH / dims.height;
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

function PlaybackViewComponent({
  timeline,
  onBack,
  musicData = null,
  showBackButton = true,
  highlightedCell = null,
  showControls = true,
  autoPlay = false,
  onCurrentIndexChange,
  onPlayingChange,
  seekIndex = null,
  seekSignal = 0,
  playbackAction = null,
  playbackSignal = 0,
}: PlaybackViewProps, ref: ForwardedRef<PlaybackViewHandle>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const youtubeContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const musicDataRef = useRef<MusicData | null>(musicData);
  const musicSourceTypeRef = useRef<MusicData["source_type"] | null>(
    musicData?.source_type ?? null
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<YTPlayer | null>(null);
  const youtubeReadyRef = useRef(false);
  const frames = useMemo(
    () => timeline.frameItems.map((item) => item.frame),
    [timeline.frameItems]
  );

  useEffect(() => {
    musicDataRef.current = musicData;
    musicSourceTypeRef.current = musicData?.source_type ?? null;
  }, [musicData]);

  const isMusicLoaded = useCallback(() => {
    const sourceType = musicSourceTypeRef.current;
    if (sourceType === "file") {
      return Boolean(audioRef.current);
    }
    if (sourceType === "youtube") {
      return Boolean(youtubePlayerRef.current && youtubeReadyRef.current);
    }
    return false;
  }, []);

  const getMusicCurrentTimeSec = useCallback(() => {
    const sourceType = musicSourceTypeRef.current;
    if (sourceType === "file") {
      return audioRef.current?.currentTime ?? 0;
    }
    if (sourceType === "youtube") {
      return youtubePlayerRef.current?.getCurrentTime() ?? 0;
    }
    return 0;
  }, []);

  const getMusicStartSec = useCallback(
    () => musicDataRef.current?.start_sec ?? 0,
    []
  );

  const getMusicEndSec = useCallback(
    () => musicDataRef.current?.end_sec ?? 0,
    []
  );

  const playMusic = useCallback(async () => {
    const sourceType = musicSourceTypeRef.current;
    if (sourceType === "file") {
      try {
        await audioRef.current?.play();
      } catch {
        // Browser autoplay policies may reject non-user-initiated playback.
      }
    } else if (sourceType === "youtube") {
      youtubePlayerRef.current?.playVideo();
    }
  }, []);

  const pauseMusic = useCallback(() => {
    const sourceType = musicSourceTypeRef.current;
    if (sourceType === "file") {
      audioRef.current?.pause();
    } else if (sourceType === "youtube") {
      youtubePlayerRef.current?.pauseVideo();
    }
  }, []);

  const seekMusic = useCallback((timeSec: number) => {
    const safeTime = Math.max(0, timeSec);
    const sourceType = musicSourceTypeRef.current;
    if (sourceType === "file" && audioRef.current) {
      audioRef.current.currentTime = safeTime;
    } else if (sourceType === "youtube") {
      youtubePlayerRef.current?.seekTo(safeTime, true);
    }
  }, []);

  // The master clock follows the configured music when it is available.
  const clock = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      createMasterClock({
        getAudioTimeMs: () => {
          if (!isMusicLoaded()) return null;
          return (getMusicCurrentTimeSec() - getMusicStartSec()) * 1000;
        },
      }),
    [getMusicCurrentTimeSec, getMusicStartSec, isMusicLoaded]
  );

  const {
    currentIndex,
    isPlaying,
    isWhiteFrame,
    frameElapsedMs,
    play: startPlayback,
    pause: pausePlayback,
    stop: stopPlayback,
    goTo,
  } = usePlayback({ timeline, clock });

  useEffect(() => {
    if (musicData?.source_type !== "file" || !musicData.file_url) return;

    const audio = new Audio(musicData.file_url);
    audio.preload = "auto";
    audio.currentTime = Math.max(0, musicData.start_sec);
    audioRef.current = audio;

    return () => {
      audio.pause();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [musicData?.file_url, musicData?.source_type, musicData?.start_sec]);

  useEffect(() => {
    if (musicData?.source_type !== "youtube" || !musicData.video_id) return;

    const container = youtubeContainerRef.current;
    if (!container) return;

    const scriptSrc = "https://www.youtube.com/iframe_api";
    if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
      const script = document.createElement("script");
      script.src = scriptSrc;
      document.head.appendChild(script);
    }

    const playerElement = document.createElement("div");
    container.appendChild(playerElement);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const waitForApi = () => {
      if (cancelled) return;

      const youtubeApi = (window as unknown as YouTubeWindow).YT;
      if (!youtubeApi?.Player) {
        timeoutId = setTimeout(waitForApi, 100);
        return;
      }

      youtubePlayerRef.current = new youtubeApi.Player(playerElement, {
        height: "0",
        width: "0",
        videoId: musicData.video_id ?? "",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (!cancelled) {
              youtubeReadyRef.current = true;
            }
          },
        },
      });
    };

    waitForApi();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      youtubeReadyRef.current = false;
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
      if (playerElement.parentNode) {
        playerElement.parentNode.removeChild(playerElement);
      }
    };
  }, [musicData?.source_type, musicData?.video_id]);

  const handlePlay = useCallback(async () => {
    if (timeline.frameItems.length === 0) return;

    if (clock.now() >= timeline.totalMs) {
      clock.reset();
    }

    if (isMusicLoaded()) {
      seekMusic(getMusicStartSec() + clock.now() / 1000);
      await playMusic();
    }

    startPlayback();
  }, [
    clock,
    getMusicStartSec,
    isMusicLoaded,
    playMusic,
    seekMusic,
    startPlayback,
    timeline.frameItems.length,
    timeline.totalMs,
  ]);

  const handlePause = useCallback(() => {
    pauseMusic();
    pausePlayback();
  }, [pauseMusic, pausePlayback]);

  const handleStop = useCallback(() => {
    pauseMusic();
    if (isMusicLoaded()) {
      seekMusic(getMusicStartSec());
    }
    stopPlayback();
  }, [getMusicStartSec, isMusicLoaded, pauseMusic, seekMusic, stopPlayback]);

  const handleGoTo = useCallback(
    (index: number) => {
      goTo(index);
      if (isMusicLoaded()) {
        seekMusic(getMusicStartSec() + clock.now() / 1000);
      }
    },
    [clock, getMusicStartSec, goTo, isMusicLoaded, seekMusic]
  );

  const handleNext = useCallback(() => {
    handleGoTo(currentIndex + 1);
  }, [currentIndex, handleGoTo]);

  const handlePrev = useCallback(() => {
    handleGoTo(currentIndex - 1);
  }, [currentIndex, handleGoTo]);

  const handleToggle = useCallback(async () => {
    if (isPlaying) {
      handlePause();
      return;
    }
    await handlePlay();
  }, [handlePause, handlePlay, isPlaying]);

  useImperativeHandle(
    ref,
    () => ({
      play: handlePlay,
      pause: handlePause,
      stop: handleStop,
      toggle: handleToggle,
      goTo: handleGoTo,
    }),
    [handleGoTo, handlePause, handlePlay, handleStop, handleToggle]
  );

  useEffect(() => {
    if (autoPlay) {
      void handlePlay();
    }
  }, [autoPlay, handlePlay]);

  useEffect(() => {
    onCurrentIndexChange?.(currentIndex);
  }, [currentIndex, onCurrentIndexChange]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    if (seekIndex === null) return;
    handleGoTo(seekIndex);
  }, [handleGoTo, seekIndex, seekSignal]);

  useEffect(() => {
    if (!playbackAction) return;

    if (playbackAction === "play") {
      void handlePlay();
    } else if (playbackAction === "pause") {
      handlePause();
    } else if (playbackAction === "stop") {
      handleStop();
    } else {
      void handleToggle();
    }
  }, [
    handlePause,
    handlePlay,
    handleStop,
    handleToggle,
    playbackAction,
    playbackSignal,
  ]);

  useEffect(() => {
    if (!isPlaying) return;

    let frameId: number;
    const tick = () => {
      if (isMusicLoaded()) {
        const endSec = getMusicEndSec();
        if (endSec > 0 && getMusicCurrentTimeSec() >= endSec) {
          handlePause();
          return;
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    getMusicCurrentTimeSec,
    getMusicEndSec,
    handlePause,
    isMusicLoaded,
    isPlaying,
  ]);

  const renderCurrentFrame = useCallback(() => {
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

    const cellSize = Math.min(availableWidth / dims.width, availableHeight / dims.height);
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
      drawCellHighlight(ctx, dims, canvasW, canvasH, highlightedCell);
      return;
    }

    if (isWhiteFrame) {
      ctx.fillStyle = COLOR_MAP[UNDEFINED_COLOR];
      ctx.fillRect(0, 0, canvasW, canvasH);
      drawCellHighlight(ctx, dims, canvasW, canvasH, highlightedCell);
      return;
    }

    if (frame.kind === "general") {
      drawGrid(ctx, frame.grid, canvasW, canvasH);
    } else if (frame.kind === "keep") {
      drawGrid(ctx, frame.displayGrid, canvasW, canvasH);
    } else {
      drawWave(ctx, frame, frameElapsedMs, canvasW, canvasH);
    }
    drawCellHighlight(ctx, dims, canvasW, canvasH, highlightedCell);
  }, [
    currentIndex,
    frames,
    frameElapsedMs,
    highlightedCell,
    isWhiteFrame,
    timeline.gapItems,
  ]);

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

  const currentFrame = frames[currentIndex];
  const headerName = isWhiteFrame
    ? timeline.gapItems[currentIndex]?.transitionKind === "keep"
      ? "（keep中）"
      : "（間隔中）"
    : currentFrame?.name ?? `Frame ${currentIndex + 1}`;

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      <div
        ref={youtubeContainerRef}
        className="h-0 w-0 overflow-hidden"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-card-border">
        {showBackButton ? (
          <button
            onClick={onBack}
            className="text-muted hover:text-foreground transition-colors text-lg px-2"
          >
            ←
          </button>
        ) : (
          <span className="w-8" aria-hidden="true" />
        )}
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
        className="min-h-0 flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} />
      </div>

      {/* Controls */}
      {showControls && (
      <div className="shrink-0 px-4 py-3 border-t border-card-border space-y-3">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {frames.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                handlePause();
                handleGoTo(idx);
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
            onClick={handleStop}
            className="text-muted hover:text-foreground transition-colors px-2 py-1"
          >
            ⏹
          </button>
          <button
            onClick={handlePrev}
            className="text-muted hover:text-foreground transition-colors px-2 py-1 text-lg"
          >
            ⏮
          </button>
          <button
            onClick={() => void handleToggle()}
            className="w-12 h-12 flex items-center justify-center bg-accent text-black rounded-full text-xl hover:opacity-90 transition-opacity"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            onClick={handleNext}
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
      )}
    </div>
  );
}

export default forwardRef<PlaybackViewHandle, PlaybackViewProps>(
  PlaybackViewComponent
);
