"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PlaybackView from "@/components/playback/PlaybackView";
import { fetchJson } from "@/lib/client/api";
import { generateScriptHtml } from "@/lib/export/generateScript";
import { decodeGrid } from "@/lib/grid/codec";
import type { ColorIndex, GridData } from "@/lib/grid/types";

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
          response.frames.map((frame) =>
            decodeGrid(
              frame.gridData,
              response.project.gridWidth,
              response.project.gridHeight
            )
          )
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
    if (!data) return null;

    const columnIndex = parseColumnLetters(alphabetInput);
    const row = Number(numberInput);
    if (columnIndex === null || !Number.isInteger(row)) return null;
    if (
      row < 1 ||
      row > data.project.gridHeight ||
      columnIndex < 0 ||
      columnIndex >= data.project.gridWidth
    ) {
      return null;
    }

    return {
      x: columnIndex,
      y: row - 1,
    };
  }, [alphabetInput, data, numberInput]);

  const scriptHtml = useMemo(() => {
    if (!data || !highlightedCell || frames.length === 0) return "";

    const scenes = frames.map((grid, index) => ({
      sceneNumber: index + 1,
      colorIndex: grid.cells[
        highlightedCell.y * data.project.gridWidth + highlightedCell.x
      ] as ColorIndex,
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
      <div className="shrink-0 border-b border-card-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
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
              max={data.project.gridHeight}
              value={numberInput}
              onChange={(event) => setNumberInput(event.target.value)}
              className="w-24 rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-400"
            />
          </label>

          <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {cellDescription}
          </div>

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
              autoPlay
              onCurrentIndexChange={setCurrentFrameIndex}
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
