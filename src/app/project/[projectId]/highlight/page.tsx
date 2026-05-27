"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PlaybackView from "@/components/playback/PlaybackView";
import { fetchJson } from "@/lib/client/api";
import { generateScriptHtml } from "@/lib/export/generateScript";
import { decodeGrid } from "@/lib/grid/codec";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";

interface HighlightResponse {
  project: {
    id: string;
    name: string;
    gridWidth: number;
    gridHeight: number;
  };
  branch: {
    id: string;
    name: string;
  };
  panelColumn: {
    label: string;
    startNodeId: string;
    startNodeName: string;
  };
  frames: Array<{
    id: string;
    name: string;
    gridData: string;
    memo: string;
  }>;
}

function parseColumnLetters(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return null;

  let columnNumber = 0;
  for (const letter of normalized) {
    columnNumber = columnNumber * 26 + (letter.charCodeAt(0) - 64);
  }

  return columnNumber - 1;
}

function inferGridDimensions(
  gridData: string,
  fallbackWidth: number,
  fallbackHeight: number
) {
  const cellCount = atob(gridData).length;
  const fallbackCellCount = fallbackWidth * fallbackHeight;

  if (cellCount === fallbackCellCount || cellCount <= 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }

  if (cellCount % fallbackHeight === 0) {
    return { width: cellCount / fallbackHeight, height: fallbackHeight };
  }

  if (cellCount % fallbackWidth === 0) {
    return { width: fallbackWidth, height: cellCount / fallbackWidth };
  }

  return { width: fallbackWidth, height: fallbackHeight };
}

interface PanelThumbnailProps {
  grid: GridData;
  name: string;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
}

function PanelThumbnail({
  grid,
  name,
  index,
  isActive,
  onSelect,
}: PanelThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const thumbW = 200;
    const thumbH = Math.round((grid.height / grid.width) * thumbW);
    canvas.width = thumbW;
    canvas.height = thumbH;

    const cellW = thumbW / grid.width;
    const cellH = thumbH / grid.height;

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[colorIdx];
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [grid]);

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={`w-full rounded-lg border p-2 text-left transition-colors ${
        isActive
          ? "border-emerald-400 bg-emerald-400/10"
          : "border-card-border bg-background/70 hover:border-accent/60"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full rounded bg-background"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
            isActive
              ? "bg-emerald-400 text-black"
              : "bg-card text-muted"
          }`}
        >
          {index + 1}
        </span>
        <span className="min-w-0 truncate text-xs text-foreground">
          {name || "Untitled"}
        </span>
      </div>
    </button>
  );
}

export default function HighlightPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [data, setData] = useState<HighlightResponse | null>(null);
  const [frames, setFrames] = useState<GridData[]>([]);
  const [alphabetInput, setAlphabetInput] = useState("A");
  const [numberInput, setNumberInput] = useState("1");
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const [playbackControl, setPlaybackControl] = useState<{
    action: "play" | "pause" | null;
    signal: number;
  }>({ action: null, signal: 0 });
  const [panelDrawerOpen, setPanelDrawerOpen] = useState(false);
  const [panelSeek, setPanelSeek] = useState({ index: 0, signal: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchJson<HighlightResponse>(
          `/api/projects/${projectId}/highlight`
        );
        setData(response);
        setFrames(
          response.frames.map((frame) => {
            const dimensions = inferGridDimensions(
              frame.gridData,
              response.project.gridWidth,
              response.project.gridHeight
            );

            return decodeGrid(
              frame.gridData,
              dimensions.width,
              dimensions.height
            );
          })
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "表示ページを読み込めませんでした"
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [projectId]);

  const highlightedCell = useMemo(() => {
    const displayGrid = frames[0];
    if (!displayGrid) return null;

    const rowIndex = parseColumnLetters(alphabetInput);
    const cellNumber = Number(numberInput);
    if (rowIndex === null || !Number.isInteger(cellNumber)) return null;
    if (
      rowIndex < 0 ||
      rowIndex >= displayGrid.height ||
      cellNumber < 1 ||
      cellNumber > displayGrid.width
    ) {
      return null;
    }

    return {
      x: cellNumber - 1,
      y: rowIndex,
    };
  }, [alphabetInput, frames, numberInput]);

  const scriptHtml = useMemo(() => {
    if (!data || !highlightedCell || frames.length === 0) return "";

    const scenes = frames.map((grid, index) => ({
      sceneNumber: index + 1,
      colorIndex:
        highlightedCell.x < grid.width && highlightedCell.y < grid.height
          ? (grid.cells[
              highlightedCell.y * grid.width + highlightedCell.x
            ] as ColorIndex)
          : 0,
      memo: data.frames[index]?.memo || "",
    }));

    return generateScriptHtml(
      highlightedCell.x,
      highlightedCell.y,
      scenes,
      data.project.name,
      {
        highlightedSceneNumber: Math.min(currentFrameIndex + 1, frames.length),
      }
    );
  }, [currentFrameIndex, data, frames, highlightedCell]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (error || !data || frames.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-muted">
            {error ?? "表示するパネル列がありません"}
          </p>
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="text-accent hover:opacity-80 transition-opacity"
          >
            ← ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  const frameNames = data.frames.map((frame) => frame.name);
  const cellDescription = highlightedCell
    ? `${alphabetInput.trim().toUpperCase()} ${numberInput}`
    : "範囲外";

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {panelDrawerOpen && (
        <button
          type="button"
          aria-label="パネル一覧を閉じる"
          onClick={() => setPanelDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/50"
        />
      )}

      <aside
        aria-hidden={!panelDrawerOpen}
        className={`fixed left-0 top-0 z-50 h-full w-72 max-w-[86vw] border-r border-card-border bg-card shadow-2xl transition-transform duration-200 ${
          panelDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-card-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                Panels
              </p>
              <h2 className="mt-1 truncate text-sm font-semibold text-foreground">
                {data.panelColumn.label} / {data.branch.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setPanelDrawerOpen(false)}
              className="shrink-0 rounded-lg border border-card-border px-2 py-1 text-sm text-muted hover:text-foreground"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-73px)] space-y-3 overflow-y-auto p-3">
          {data.frames.map((frame, index) => {
            const grid = frames[index];
            if (!grid) return null;

            return (
              <PanelThumbnail
                key={frame.id}
                grid={grid}
                name={frame.name}
                index={index}
                isActive={index === currentFrameIndex}
                onSelect={(nextIndex) => {
                  setPanelSeek((prev) => ({
                    index: nextIndex,
                    signal: prev.signal + 1,
                  }));
                  setCurrentFrameIndex(nextIndex);
                  setPanelDrawerOpen(false);
                }}
              />
            );
          })}
        </div>
      </aside>

      <div className="shrink-0 border-b border-card-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={() => setPanelDrawerOpen(true)}
            className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-card-border bg-background hover:border-accent/50 transition-colors"
            aria-label="パネル一覧"
          >
            <span className="h-0.5 w-4 bg-foreground" />
            <span className="h-0.5 w-4 bg-foreground" />
            <span className="h-0.5 w-4 bg-foreground" />
          </button>

          <div className="mr-auto min-w-[220px]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {data.branch.name} / {data.panelColumn.label}
            </p>
            <h1 className="mt-1 truncate text-base font-semibold">
              {data.project.name}
            </h1>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">アルファベット</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              value={alphabetInput}
              onChange={(event) =>
                setAlphabetInput(event.target.value.toUpperCase())
              }
              className="w-24 rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-400"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">数字</span>
            <input
              type="number"
              min={1}
              max={frames[0]?.width ?? data.project.gridWidth}
              value={numberInput}
              onChange={(event) => setNumberInput(event.target.value)}
              className="w-24 rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-400"
            />
          </label>

          <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {cellDescription}
          </div>

          <button
            type="button"
            onClick={() =>
              setPlaybackControl((prev) => ({
                action: isPlaybackPlaying ? "pause" : "play",
                signal: prev.signal + 1,
              }))
            }
            disabled={frames.length <= 1}
            className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-4 py-2 text-sm text-foreground hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <span className="text-base leading-none">
              {isPlaybackPlaying ? "⏸" : "▶"}
            </span>
            <span>{isPlaybackPlaying ? "一時停止" : "再生"}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="rounded-lg border border-card-border bg-background px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
            >
              設定
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 rounded-lg border border-card-border bg-card p-3 shadow-xl">
                <button
                  onClick={() => {
                    setShowScript((prev) => !prev);
                    setSettingsOpen(false);
                  }}
                  disabled={!highlightedCell}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    showScript
                      ? "bg-emerald-400/15 text-emerald-200"
                      : "text-foreground hover:bg-background"
                  } disabled:opacity-40`}
                >
                  パネル原稿を表示
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className={`h-full min-h-0 ${showScript ? "flex" : ""}`}>
          <div className={showScript ? "h-full min-w-0 flex-1 basis-1/2" : "h-full"}>
            <PlaybackView
              frames={frames}
              frameNames={frameNames}
              highlightedCell={highlightedCell}
              showControls={false}
              autoPlay={false}
              onCurrentIndexChange={setCurrentFrameIndex}
              onPlayingChange={setIsPlaybackPlaying}
              seekIndex={panelSeek.index}
              seekSignal={panelSeek.signal}
              playbackAction={playbackControl.action}
              playbackSignal={playbackControl.signal}
              onBack={() => router.push(`/project/${projectId}`)}
            />
          </div>

          {showScript && (
            <div className="h-full min-w-0 flex-1 basis-1/2 border-l border-card-border bg-white">
              {scriptHtml ? (
                <iframe
                  title="パネル原稿"
                  srcDoc={scriptHtml}
                  sandbox=""
                  className="block h-full w-full bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-card text-sm text-muted">
                  セル位置を指定してください
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
