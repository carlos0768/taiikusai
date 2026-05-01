"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { MusicData } from "@/types";
import {
  deleteProjectAudio,
  uploadProjectAudio,
} from "@/lib/api/projectAudio";
import MusicWaveform from "./MusicWaveform";

const WAVEFORM_HEIGHT = 56;
const TIMELINE_PX_OPTIONS = [30, 60, 90] as const;

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

/**
 * 親 (PlaybackPanel) がマスタークロック・パネル進行と同期して呼び出すハンドル。
 * 「音楽プレイヤーを直接操作する」窓口で、内部の React state を経由しないので
 * 1 tick の遅延も生まれない。
 */
export interface MusicTrackHandle {
  isLoaded(): boolean;
  /** 現在の再生位置 (秒)。未ロード時は 0。 */
  getCurrentTimeSec(): number;
  /** トリミング開始位置 (秒)。 */
  getStartSec(): number;
  /** トリミング終了位置 (秒)。0 なら全長を意味する。 */
  getEndSec(): number;
  play(): Promise<void>;
  pause(): void;
  seek(timeSec: number): void;
}

interface MusicTrackProps {
  pxPerSecond: number;
  projectId: string;
  initialMusic: MusicData | null;
  onMusicChange: (data: MusicData | null) => Promise<void> | void;
  /** 親から流れる現在の再生位置 (秒)。波形キャレット・残時間表示に使う。 */
  currentTimeSec: number;
  /** 親が再生中かどうか。trim ハンドル操作の無効化に使う。 */
  isPlaying: boolean;
  onPxPerSecondChange: (value: number) => void;
}

function BeatGridOverlay({
  width,
  height,
  duration,
  pxPerSecond,
  bpm,
  bpmOffsetSec,
}: {
  width: number;
  height: number;
  duration: number;
  pxPerSecond: number;
  bpm: number | null;
  bpmOffsetSec: number | null;
}) {
  if (!bpm || bpm <= 0 || duration <= 0) return null;

  const beatIntervalSec = 60 / bpm;
  const phaseSec =
    ((bpmOffsetSec ?? 0) % beatIntervalSec + beatIntervalSec) %
    beatIntervalSec;
  const markers: Array<{ x: number; isMeasureStart: boolean }> = [];

  for (
    let beatNumber = 0, t = phaseSec;
    t <= duration;
    beatNumber++, t += beatIntervalSec
  ) {
    const x = t * pxPerSecond;
    if (x < 0 || x > width) continue;
    markers.push({
      x,
      isMeasureStart: beatNumber % 4 === 0,
    });
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width, height, zIndex: 30 }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {markers.map((marker, index) => {
        const strokeWidth = marker.isMeasureStart ? 2 : 1;
        const strokeOpacity = marker.isMeasureStart ? 0.95 : 0.62;
        return (
          <g key={`beat-${index}`}>
            <line
              x1={marker.x}
              y1={0}
              x2={marker.x}
              y2={height}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={strokeWidth + 1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={marker.x}
              y1={0}
              x2={marker.x}
              y2={height}
              stroke={`rgba(255,255,255,${strokeOpacity})`}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {markers
        .filter((marker) => marker.isMeasureStart)
        .map((marker, index) => (
          <g key={`measure-${index}`}>
            <polygon
              points={`${marker.x},0 ${marker.x - 6},9 ${marker.x + 6},9`}
              fill="#ff2525"
              stroke="rgba(0,0,0,0.65)"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={`${marker.x},${height} ${marker.x - 6},${height - 9} ${
                marker.x + 6
              },${height - 9}`}
              fill="#ff2525"
              stroke="rgba(0,0,0,0.65)"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
    </svg>
  );
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

function MusicTrack(
  {
    pxPerSecond,
    projectId,
    initialMusic,
    onMusicChange,
    currentTimeSec,
    isPlaying,
    onPxPerSecondChange,
  }: MusicTrackProps,
  ref: React.ForwardedRef<MusicTrackHandle>
) {
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<"youtube" | "file" | null>(
    initialMusic?.source_type ?? null
  );
  const [videoId, setVideoId] = useState<string | null>(
    initialMusic?.source_type === "youtube" ? initialMusic.video_id ?? null : null
  );
  const [fileName, setFileName] = useState<string | null>(
    initialMusic?.source_type === "file" ? initialMusic.file_name ?? null : null
  );
  const [fileUrl, setFileUrl] = useState<string | null>(
    initialMusic?.source_type === "file" ? initialMusic.file_url ?? null : null
  );
  const [startTime, setStartTime] = useState(initialMusic?.start_sec ?? 0);
  const [endTime, setEndTime] = useState(initialMusic?.end_sec ?? 0);
  const [duration, setDuration] = useState(initialMusic?.duration ?? 0);
  const [offsetSec, setOffsetSec] = useState(initialMusic?.offset_sec ?? 0);
  const [bpm, setBpm] = useState<number | null>(initialMusic?.bpm ?? null);
  const [bpmOffsetSec, setBpmOffsetSec] = useState<number>(
    initialMusic?.bpm_offset_sec ?? 0
  );
  const [bpmInputValue, setBpmInputValue] = useState<string>(
    initialMusic?.bpm ? String(initialMusic.bpm) : ""
  );
  const [showInput, setShowInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const apiLoadedRef = useRef(false);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const playerReadyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const filePathRef = useRef<string | null>(
    initialMusic?.source_type === "file" ? initialMusic.file_path ?? null : null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTypeRef = useRef(sourceType);
  sourceTypeRef.current = sourceType;
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  startTimeRef.current = startTime;
  endTimeRef.current = endTime;
  // Skip the first auto-save effect run (triggered by hydration itself)
  const hydratedRef = useRef(false);

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
            setEndTime((prev) => (prev === 0 ? dur : prev));
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

  // Hydrate the <audio> element on mount when the project already has a
  // persisted file source. New selections (handleFileSelect) create their
  // own Audio element, so this effect only fires for the initial restore.
  useEffect(() => {
    if (
      initialMusic?.source_type === "file" &&
      initialMusic.file_url &&
      !audioRef.current
    ) {
      const audio = new Audio(initialMusic.file_url);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => {
        const dur = audio.duration;
        if (isFinite(dur) && dur > 0) {
          setDuration((prev) => (prev > 0 ? prev : dur));
          setEndTime((prev) => (prev > 0 ? prev : dur));
        }
      });
      audioRef.current = audio;
    }
    // Only runs on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the latest onMusicChange in a ref so the debounce effect doesn't
  // resubscribe when the parent passes a new callback instance.
  const onMusicChangeRef = useRef(onMusicChange);
  onMusicChangeRef.current = onMusicChange;

  // Debounced auto-save (2s) — mirrors GridEditor's pattern so the editing
  // experience feels consistent across the app.
  useEffect(() => {
    // Skip the very first run (triggered by hydration state).
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      let data: MusicData | null = null;
      if (sourceType === "youtube" && videoId) {
        data = {
          source_type: "youtube",
          video_id: videoId,
          start_sec: startTime,
          end_sec: endTime,
          offset_sec: offsetSec,
          duration,
          bpm: bpm ?? null,
          bpm_offset_sec: bpmOffsetSec,
          timeline_px_per_second: pxPerSecond,
        };
      } else if (sourceType === "file" && fileUrl) {
        data = {
          source_type: "file",
          file_url: fileUrl,
          file_path: filePathRef.current ?? undefined,
          file_name: fileName ?? undefined,
          start_sec: startTime,
          end_sec: endTime,
          offset_sec: offsetSec,
          duration,
          bpm: bpm ?? null,
          bpm_offset_sec: bpmOffsetSec,
          timeline_px_per_second: pxPerSecond,
        };
      }
      void Promise.resolve(onMusicChangeRef.current(data)).catch(() => {
        // Silent — next edit will retry the save.
      });
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    sourceType,
    videoId,
    fileUrl,
    fileName,
    startTime,
    endTime,
    offsetSec,
    duration,
    bpm,
    bpmOffsetSec,
    pxPerSecond,
  ]);

  useImperativeHandle(
    ref,
    (): MusicTrackHandle => ({
      isLoaded() {
        const t = sourceTypeRef.current;
        if (t === "youtube") {
          return !!playerRef.current && playerReadyRef.current;
        }
        if (t === "file") {
          return !!audioRef.current;
        }
        return false;
      },
      getCurrentTimeSec() {
        const t = sourceTypeRef.current;
        if (t === "youtube") {
          return playerRef.current?.getCurrentTime() ?? 0;
        }
        if (t === "file") {
          return audioRef.current?.currentTime ?? 0;
        }
        return 0;
      },
      getStartSec() {
        return startTimeRef.current;
      },
      getEndSec() {
        return endTimeRef.current;
      },
      async play() {
        const t = sourceTypeRef.current;
        if (t === "youtube") {
          playerRef.current?.playVideo();
        } else if (t === "file") {
          try {
            await audioRef.current?.play();
          } catch {
            // ユーザー操作起点でない自動再生がブロックされる場合があるので無視
          }
        }
      },
      pause() {
        const t = sourceTypeRef.current;
        if (t === "youtube") {
          playerRef.current?.pauseVideo();
        } else if (t === "file") {
          audioRef.current?.pause();
        }
      },
      seek(timeSec: number) {
        const safe = Math.max(0, timeSec);
        const t = sourceTypeRef.current;
        if (t === "youtube") {
          playerRef.current?.seekTo(safe, true);
        } else if (t === "file" && audioRef.current) {
          audioRef.current.currentTime = safe;
        }
      },
    }),
    []
  );

  const handleUrlSubmit = useCallback(() => {
    const id = extractVideoId(url);
    if (!id) return;

    // Clear any existing file source (both in memory and in storage)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const oldPath = filePathRef.current;
    filePathRef.current = null;
    if (oldPath) {
      void deleteProjectAudio(oldPath);
    }
    setFileName(null);
    setFileUrl(null);

    setVideoId(id);
    setSourceType("youtube");
    setShowInput(false);
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setOffsetSec(0);
    setBpm(null);
    setBpmOffsetSec(0);
    setBpmInputValue("");
    setUploadError(null);
  }, [url]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so the same file can be reselected later
      e.target.value = "";
      if (!file) return;

      setUploadError(null);
      setUploading(true);

      try {
        // Upload first so we always play from a persisted URL
        const { url: publicUrl, path } = await uploadProjectAudio(
          projectId,
          file
        );

        // Clear any existing YouTube source
        if (playerRef.current) {
          playerReadyRef.current = false;
          playerRef.current.destroy();
          playerRef.current = null;
        }
        setVideoId(null);
        setUrl("");

        // Delete any previous file from storage (best-effort)
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const oldPath = filePathRef.current;
        if (oldPath && oldPath !== path) {
          void deleteProjectAudio(oldPath);
        }
        filePathRef.current = path;

        const audio = new Audio(publicUrl);
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
        setFileUrl(publicUrl);
        setSourceType("file");
        setShowInput(false);
        setStartTime(0);
        setEndTime(0);
        setDuration(0);
        setOffsetSec(0);
        setBpm(null);
        setBpmOffsetSec(0);
        setBpmInputValue("");
      } catch (err) {
        console.error(err);
        setUploadError("アップロードに失敗しました");
      } finally {
        setUploading(false);
      }
    },
    [projectId]
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
    const oldPath = filePathRef.current;
    filePathRef.current = null;
    if (oldPath) {
      void deleteProjectAudio(oldPath);
    }
    setFileName(null);
    setFileUrl(null);

    setSourceType(null);
    setUrl("");
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setOffsetSec(0);
    setBpm(null);
    setBpmOffsetSec(0);
    setBpmInputValue("");
    setUploadError(null);
  }, []);

  // Clean up the audio element on unmount (do NOT delete storage files —
  // they persist with the project and must survive unmounting).
  useEffect(() => {
    return () => {
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

  // 再生中は trim 操作を無効化 (本番中の誤操作防止)
  const handleTrimPointerDown = useCallback(
    (edge: "start" | "end", e: React.PointerEvent) => {
      if (isPlaying) return;
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = edge;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isPlaying]
  );

  const handleMovePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isPlaying) return;
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = "move";
      moveStartXRef.current = e.clientX;
      moveStartOffsetRef.current = offsetSec;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offsetSec, isPlaying]
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

  const handleBpmChange = useCallback((value: string) => {
    setBpmInputValue(value);
    if (value.trim() === "") {
      setBpm(null);
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (n <= 0) {
      setBpm(null);
      return;
    }
    setBpm(Math.min(400, Math.max(20, n)));
  }, []);

  const nudgeBpmOffset = useCallback(
    (deltaSec: number) => {
      if (!bpm || bpm <= 0) return;
      const beatIntervalSec = 60 / bpm;
      setBpmOffsetSec((prev) => {
        let next = prev + deltaSec;
        // Keep offset within [0, beatIntervalSec) since shifting by a full
        // beat produces an identical grid.
        next = ((next % beatIntervalSec) + beatIntervalSec) % beatIntervalSec;
        return Math.round(next * 1000) / 1000;
      });
    },
    [bpm]
  );

  const barWidth = Math.max(100, duration * pxPerSecond);
  const playheadSec = Math.max(0, currentTimeSec);
  const displayCurrentSec = Math.max(0, currentTimeSec);

  if (!sourceType) {
    return (
      <div className="py-1 shrink-0">
        <div className="sticky left-0 px-3" style={{ width: "fit-content" }}>
          {uploading ? (
            <span className="text-xs text-muted">アップロード中...</span>
          ) : showInput ? (
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
          {uploadError && (
            <p className="text-[9px] text-danger mt-1">{uploadError}</p>
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
          {Math.floor(displayCurrentSec / 60)}:{String(Math.floor(displayCurrentSec % 60)).padStart(2, "0")}
          {" / "}
          {Math.floor((endTime || duration) / 60)}:{String(Math.floor((endTime || duration) % 60)).padStart(2, "0")}
        </span>
        <span className="text-[9px] text-muted/70">·</span>
        <label className="flex items-center gap-1 text-[9px] text-muted">
          BPM
          <input
            type="number"
            inputMode="decimal"
            min={20}
            max={400}
            step="0.1"
            value={bpmInputValue}
            onChange={(e) => handleBpmChange(e.target.value)}
            placeholder="—"
            className="w-12 px-1 py-0.5 bg-background border border-card-border rounded text-[10px] text-foreground focus:outline-none focus:border-accent"
          />
        </label>
        {bpm && bpm > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] text-muted">
            <span>位相</span>
            <button
              type="button"
              onClick={() => nudgeBpmOffset(-0.01)}
              className="px-1 hover:text-foreground"
              aria-label="ビートグリッドを左にずらす"
            >
              ◀
            </button>
            <span className="tabular-nums w-9 text-center text-foreground/70">
              {bpmOffsetSec.toFixed(2)}s
            </span>
            <button
              type="button"
              onClick={() => nudgeBpmOffset(0.01)}
              className="px-1 hover:text-foreground"
              aria-label="ビートグリッドを右にずらす"
            >
              ▶
            </button>
          </span>
        )}
        <span className="flex items-center gap-0.5 rounded border border-card-border/70 bg-background/70 p-0.5 text-[9px] text-muted">
          {TIMELINE_PX_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPxPerSecondChange(option)}
              className={`rounded px-1.5 py-0.5 tabular-nums transition-colors ${
                pxPerSecond === option
                  ? "bg-accent text-black"
                  : "hover:bg-card-border hover:text-foreground"
              }`}
              aria-pressed={pxPerSecond === option}
            >
              {option}
            </button>
          ))}
          <span className="px-0.5">px/s</span>
        </span>
        <button
          onClick={handleRemove}
          className="text-[9px] text-muted hover:text-danger"
        >
          ✕
        </button>
      </div>

      {/* Time-proportional bar with waveform + beat grid */}
      <div
        ref={barRef}
        className="bg-black/40 rounded relative select-none touch-none overflow-hidden"
        style={{
          width: barWidth,
          height: WAVEFORM_HEIGHT,
          marginLeft: 12 + offsetSec * pxPerSecond,
        }}
        onPointerMove={handleTrimPointerMove}
        onPointerUp={handleTrimPointerUp}
      >
        {/* Waveform + beat-grid canvas (DJ-software style) */}
        <MusicWaveform
          audioUrl={sourceType === "file" ? fileUrl : null}
          duration={duration}
          pxPerSecond={pxPerSecond}
          width={barWidth}
          height={WAVEFORM_HEIGHT}
        />

        {/* Dimmed regions outside trim */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-black/55 rounded-l"
          style={{ width: startTime * pxPerSecond }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/55 rounded-r"
          style={{ width: (duration - (endTime || duration)) * pxPerSecond }}
        />

        {/* Trim region (draggable to move) */}
        <div
          className={`absolute top-0 bottom-0 bg-accent/20 z-[5] ${
            isPlaying ? "cursor-default" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{
            left: startTime * pxPerSecond,
            width: ((endTime || duration) - startTime) * pxPerSecond,
          }}
          onPointerDown={handleMovePointerDown}
        />

        <BeatGridOverlay
          width={barWidth}
          height={WAVEFORM_HEIGHT}
          duration={duration}
          pxPerSecond={pxPerSecond}
          bpm={bpm}
          bpmOffsetSec={bpmOffsetSec}
        />

        {/* Start handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 z-10 flex items-center justify-center ${
            isPlaying ? "cursor-default opacity-50" : "cursor-col-resize"
          }`}
          style={{ left: startTime * pxPerSecond - 6 }}
          onPointerDown={(e) => handleTrimPointerDown("start", e)}
        >
          <div className="w-0.5 h-7 bg-accent rounded-full" />
        </div>

        {/* End handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 z-10 flex items-center justify-center ${
            isPlaying ? "cursor-default opacity-50" : "cursor-col-resize"
          }`}
          style={{ left: (endTime || duration) * pxPerSecond - 6 }}
          onPointerDown={(e) => handleTrimPointerDown("end", e)}
        >
          <div className="w-0.5 h-7 bg-accent rounded-full" />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
          style={{ left: playheadSec * pxPerSecond }}
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

export default forwardRef<MusicTrackHandle, MusicTrackProps>(MusicTrack);
