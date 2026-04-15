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
  const [sourceType, setSourceType] = useState<"youtube" | "file" | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [offsetSec, setOffsetSec] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const apiLoadedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const playerReadyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Sync play/pause with panel playback (handles both YouTube and file sources)
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (!sourceType) return;

    const ready =
      sourceType === "youtube"
        ? !!playerRef.current && playerReadyRef.current
        : !!audioRef.current;
    if (!ready) return;

    const play = () => {
      if (sourceType === "youtube") {
        playerRef.current?.playVideo();
      } else {
        audioRef.current?.play().catch(() => {});
      }
    };
    const pause = () => {
      if (sourceType === "youtube") {
        playerRef.current?.pauseVideo();
      } else {
        audioRef.current?.pause();
      }
    };
    const seek = (t: number) => {
      if (sourceType === "youtube") {
        playerRef.current?.seekTo(t, true);
      } else if (audioRef.current) {
        audioRef.current.currentTime = t;
      }
    };
    const getTime = () => {
      if (sourceType === "youtube") {
        return playerRef.current?.getCurrentTime() ?? 0;
      }
      return audioRef.current?.currentTime ?? 0;
    };

    if (isPlaying) {
      // Only seek to start when playback begins (false → true)
      if (!wasPlayingRef.current) {
        seek(startTimeRef.current);
      }
      wasPlayingRef.current = true;
      play();

      // Track current time
      timerRef.current = setInterval(() => {
        const t = getTime();
        setCurrentTime(t);
        const end = endTimeRef.current;
        if (end > 0 && t >= end) {
          pause();
          onPlayStateChange(false);
        }
      }, 100);
    } else {
      wasPlayingRef.current = false;
      pause();
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
  }, [isPlaying, sourceType, videoId, onPlayStateChange]);

  const handleUrlSubmit = useCallback(() => {
    const id = extractVideoId(url);
    if (id) {
      // Clear any existing file source
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }
      setFileName(null);

      setVideoId(id);
      setSourceType("youtube");
      setShowInput(false);
      setStartTime(0);
      setEndTime(0);
      setDuration(0);
      setCurrentTime(0);
      setOffsetSec(0);
    }
  }, [url]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so the same file can be reselected later
      e.target.value = "";
      if (!file) return;

      // Clear any existing YouTube source
      if (playerRef.current) {
        playerReadyRef.current = false;
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setVideoId(null);
      setUrl("");

      // Clean up any previous file source
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }

      const objectUrl = URL.createObjectURL(file);
      fileUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => {
        const dur = audio.duration;
        if (isFinite(dur) && dur > 0) {
          setDuration(dur);
          setEndTime((prev) => (prev === 0 ? dur : prev));
        }
      });
      audioRef.current = audio;

      setFileName(file.name);
      setSourceType("file");
      setShowInput(false);
      setStartTime(0);
      setEndTime(0);
      setDuration(0);
      setCurrentTime(0);
      setOffsetSec(0);
    },
    []
  );

  const handleRemove = useCallback(() => {
    playerReadyRef.current = false;
    playerRef.current?.destroy();
    playerRef.current = null;
    setVideoId(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    setFileName(null);

    setSourceType(null);
    setUrl("");
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setCurrentTime(0);
    setOffsetSec(0);
  }, []);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Drag-to-trim / drag-to-move logic
  const barRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"start" | "end" | "move" | null>(null);
  const moveStartXRef = useRef(0);
  const moveStartOffsetRef = useRef(0);

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

  const handleMovePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = "move";
      moveStartXRef.current = e.clientX;
      moveStartOffsetRef.current = offsetSec;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offsetSec]
  );

  const handleTrimPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === "start") {
        const t = pointerToTime(e.clientX);
        setStartTime(Math.max(0, Math.min(t, (endTime || duration) - 1)));
      } else if (draggingRef.current === "end") {
        const t = pointerToTime(e.clientX);
        setEndTime(Math.max(startTime + 1, Math.min(t, duration)));
      } else if (draggingRef.current === "move") {
        const deltaPx = e.clientX - moveStartXRef.current;
        setOffsetSec(moveStartOffsetRef.current + deltaPx / pxPerSecond);
      }
    },
    [pointerToTime, startTime, endTime, duration, pxPerSecond]
  );

  const handleTrimPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const barWidth = Math.max(100, duration * pxPerSecond);

  if (!sourceType) {
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
              <span className="text-[9px] text-muted">または</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-accent hover:opacity-80 px-2"
              >
                ファイル選択
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
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
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
        {sourceType === "file" && fileName && (
          <span
            className="text-[9px] text-muted max-w-[140px] truncate"
            title={fileName}
          >
            {fileName}
          </span>
        )}
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
        className="h-7 bg-card-border/30 rounded relative select-none touch-none"
        style={{ width: barWidth, marginLeft: 12 + offsetSec * pxPerSecond }}
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

        {/* Trim region (draggable to move) */}
        <div
          className="absolute top-0 bottom-0 bg-accent/20 cursor-grab active:cursor-grabbing z-[5]"
          style={{
            left: startTime * pxPerSecond,
            width: ((endTime || duration) - startTime) * pxPerSecond,
          }}
          onPointerDown={handleMovePointerDown}
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
