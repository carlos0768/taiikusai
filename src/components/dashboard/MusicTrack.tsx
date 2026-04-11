"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string | HTMLElement,
        config: {
          height: string;
          width: string;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface MusicTrackProps {
  isPlaying: boolean;
  onPlayStateChange: (playing: boolean) => void;
  pxPerSecond: number;
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/v\/([^?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default function MusicTrack({
  isPlaying,
  onPlayStateChange,
  pxPerSecond,
}: MusicTrackProps) {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const apiLoadedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const playerReadyRef = useRef(false);

  // Load YouTube IFrame API
  useEffect(() => {
    if (apiLoadedRef.current || typeof window === "undefined") return;
    if (window.YT) {
      apiLoadedRef.current = true;
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      apiLoadedRef.current = true;
    };
  }, []);

  // Create/destroy player when videoId changes
  useEffect(() => {
    if (!videoId) return;

    const container = ytContainerRef.current;
    if (!container) return;

    // Create a fresh div outside React's tree for YT.Player to consume
    const playerEl = document.createElement("div");
    container.appendChild(playerEl);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const waitForApi = () => {
      if (cancelled) return;
      if (!window.YT?.Player) {
        timeoutId = setTimeout(waitForApi, 100);
        return;
      }

      playerRef.current = new window.YT.Player(playerEl, {
        height: "0",
        width: "0",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            playerReadyRef.current = true;
            const dur = event.target.getDuration();
            setDuration(dur);
            if (endTime === 0) setEndTime(dur);
          },
        },
      });
    };

    waitForApi();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      playerReadyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      if (playerEl.parentNode) {
        playerEl.parentNode.removeChild(playerEl);
      }
    };
  }, [videoId]);

  // Refs to keep trim values accessible without re-triggering the effect
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  startTimeRef.current = startTime;
  endTimeRef.current = endTime;

  // Sync play/pause with panel playback
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !videoId || !playerReadyRef.current) return;

    if (isPlaying) {
      // Only seek to start when playback begins (false → true)
      if (!wasPlayingRef.current) {
        player.seekTo(startTimeRef.current, true);
      }
      wasPlayingRef.current = true;
      player.playVideo();

      // Track current time
      timerRef.current = setInterval(() => {
        const t = player.getCurrentTime();
        setCurrentTime(t);
        const end = endTimeRef.current;
        if (end > 0 && t >= end) {
          player.pauseVideo();
          onPlayStateChange(false);
        }
      }, 100);
    } else {
      wasPlayingRef.current = false;
      player.pauseVideo();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, videoId, onPlayStateChange]);

  const handleUrlSubmit = useCallback(() => {
    const id = extractVideoId(url);
    if (id) {
      setVideoId(id);
      setShowInput(false);
    }
  }, [url]);

  const handleRemove = useCallback(() => {
    playerReadyRef.current = false;
    playerRef.current?.destroy();
    playerRef.current = null;
    setVideoId(null);
    setUrl("");
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setCurrentTime(0);
  }, []);

  // Drag-to-trim logic
  const barRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  const pointerToTime = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || pxPerSecond === 0) return 0;
      const rect = bar.getBoundingClientRect();
      const px = clientX - rect.left;
      return Math.max(0, Math.min(duration, px / pxPerSecond));
    },
    [pxPerSecond, duration]
  );

  const handleTrimPointerDown = useCallback(
    (edge: "start" | "end", e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = edge;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleTrimPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const t = pointerToTime(e.clientX);
      if (draggingRef.current === "start") {
        setStartTime(Math.max(0, Math.min(t, (endTime || duration) - 1)));
      } else {
        setEndTime(Math.max(startTime + 1, Math.min(t, duration)));
      }
    },
    [pointerToTime, startTime, endTime, duration]
  );

  const handleTrimPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const barWidth = Math.max(100, duration * pxPerSecond);

  if (!videoId) {
    return (
      <div className="py-1 shrink-0">
        <div className="sticky left-0 px-3" style={{ width: "fit-content" }}>
          {showInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                placeholder="YouTube URLをペースト"
                autoFocus
                className="w-48 px-2 py-1 bg-background border border-card-border rounded text-xs text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleUrlSubmit}
                className="text-xs text-accent hover:opacity-80 px-2"
              >
                追加
              </button>
              <button
                onClick={() => setShowInput(false)}
                className="text-xs text-muted hover:text-foreground px-1"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowInput(true)}
              className="text-xs text-muted hover:text-foreground"
            >
              + 音楽を追加
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="py-1 shrink-0">
      {/* Hidden YouTube player */}
      <div ref={ytContainerRef} className="hidden" />

      {/* Sticky controls */}
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 pb-0.5" style={{ width: "fit-content" }}>
        <span className="text-[9px] text-muted">♪</span>
        <span className="text-[9px] text-muted">
          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
          {" / "}
          {Math.floor((endTime || duration) / 60)}:{String(Math.floor((endTime || duration) % 60)).padStart(2, "0")}
        </span>
        <button
          onClick={handleRemove}
          className="text-[9px] text-muted hover:text-danger"
        >
          ✕
        </button>
      </div>

      {/* Time-proportional bar */}
      <div
        ref={barRef}
        className="h-7 bg-card-border/30 rounded relative select-none touch-none mx-3"
        style={{ width: barWidth }}
        onPointerMove={handleTrimPointerMove}
        onPointerUp={handleTrimPointerUp}
      >
        {/* Dimmed regions outside trim */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-black/30 rounded-l"
          style={{ width: startTime * pxPerSecond }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/30 rounded-r"
          style={{ width: (duration - (endTime || duration)) * pxPerSecond }}
        />

        {/* Trim region */}
        <div
          className="absolute top-0 bottom-0 bg-accent/20"
          style={{
            left: startTime * pxPerSecond,
            width: ((endTime || duration) - startTime) * pxPerSecond,
          }}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-col-resize z-10 flex items-center justify-center"
          style={{ left: startTime * pxPerSecond - 6 }}
          onPointerDown={(e) => handleTrimPointerDown("start", e)}
        >
          <div className="w-0.5 h-3.5 bg-accent rounded-full" />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-col-resize z-10 flex items-center justify-center"
          style={{ left: (endTime || duration) * pxPerSecond - 6 }}
          onPointerDown={(e) => handleTrimPointerDown("end", e)}
        >
          <div className="w-0.5 h-3.5 bg-accent rounded-full" />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
          style={{ left: currentTime * pxPerSecond }}
        />

        {/* Time labels */}
        <div className="absolute bottom-0 text-[8px] text-muted/60 leading-none pointer-events-none"
          style={{ left: startTime * pxPerSecond + 4 }}>
          {Math.floor(startTime / 60)}:{String(Math.floor(startTime % 60)).padStart(2, "0")}
        </div>
        <div className="absolute bottom-0 text-[8px] text-muted/60 leading-none pointer-events-none"
          style={{ left: (endTime || duration) * pxPerSecond - 28 }}>
          {Math.floor((endTime || duration) / 60)}:{String(Math.floor((endTime || duration) % 60)).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}
