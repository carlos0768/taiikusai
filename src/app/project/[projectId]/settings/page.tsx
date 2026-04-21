"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_TIMING_MS,
  MIN_TIMING_MS,
  msToSecondsString,
  TIMING_STEP_MS,
} from "@/lib/playback/timing";
import type { Project, ZentaiGamen } from "@/types";

interface ResizeResponse {
  project: Project;
  resizedPanelCount: number;
  resizedWavePanelCount: number;
}

function parseTimingInput(value: string): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  const ms = Math.round(seconds * 1000);
  if (ms < MIN_TIMING_MS || ms > MAX_TIMING_MS) return null;
  if (ms % TIMING_STEP_MS !== 0) return null;
  return ms;
}

function isValidGridSize(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 200;
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [panelCount, setPanelCount] = useState(0);
  const [wavePanelCount, setWavePanelCount] = useState(0);

  const [gridWidth, setGridWidth] = useState(50);
  const [gridHeight, setGridHeight] = useState(30);
  const [autoAdjustIllustration, setAutoAdjustIllustration] = useState(true);
  const [resizeSaving, setResizeSaving] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);

  const [panelInput, setPanelInput] = useState("2.0");
  const [intervalInput, setIntervalInput] = useState("1.0");
  const [savedPanelMs, setSavedPanelMs] = useState(2000);
  const [savedIntervalMs, setSavedIntervalMs] = useState(1000);
  const [timingSaving, setTimingSaving] = useState(false);
  const [timingError, setTimingError] = useState<string | null>(null);
  const [timingSuccess, setTimingSuccess] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);

      const [{ data: projectData, error: projectError }, { data: panelData, error: panelError }] =
        await Promise.all([
          supabase.from("projects").select("*").eq("id", projectId).single(),
          supabase
            .from("zentai_gamen")
            .select("id,panel_type,motion_type")
            .eq("project_id", projectId),
        ]);

      if (cancelled) return;

      if (projectError || !projectData || panelError) {
        setLoadError("設定情報の読み込みに失敗しました");
        setLoading(false);
        return;
      }

      const zentaiGamen = (panelData ?? []) as Pick<
        ZentaiGamen,
        "id" | "panel_type" | "motion_type"
      >[];

      setProject(projectData);
      setGridWidth(projectData.grid_width);
      setGridHeight(projectData.grid_height);
      setSavedPanelMs(projectData.default_panel_duration_ms);
      setSavedIntervalMs(projectData.default_interval_ms);
      setPanelInput(msToSecondsString(projectData.default_panel_duration_ms));
      setIntervalInput(msToSecondsString(projectData.default_interval_ms));
      setPanelCount(zentaiGamen.length);
      setWavePanelCount(
        zentaiGamen.filter(
          (panel) =>
            panel.panel_type === "motion" && panel.motion_type === "wave"
        ).length
      );
      setLoading(false);
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const hasGridChanges =
    project !== null &&
    (gridWidth !== project.grid_width || gridHeight !== project.grid_height);
  const isGridFormValid =
    isValidGridSize(gridWidth) && isValidGridSize(gridHeight);
  const isResizeDisabled =
    loading || resizeSaving || !project || !hasGridChanges || !isGridFormValid;
  const isBusy = resizeSaving || timingSaving;

  async function handleResizeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isResizeDisabled) return;

    setResizeSaving(true);
    setResizeError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridWidth,
          gridHeight,
          autoAdjustIllustration,
        }),
      });

      const result = (await response.json()) as
        | ResizeResponse
        | { error?: string };

      if (!response.ok) {
        const error = "error" in result ? result.error : undefined;
        throw new Error(error ?? "プロジェクトの更新に失敗しました");
      }

      if (!("project" in result)) {
        throw new Error("プロジェクトの更新に失敗しました");
      }

      alert(
        `${result.resizedPanelCount} 枚のパネルを ${gridWidth} × ${gridHeight} に更新しました。` +
          (result.resizedWavePanelCount > 0
            ? ` ウェーブ ${result.resizedWavePanelCount} 枚も補正済みです。`
            : "")
      );
      router.push(`/project/${projectId}`);
      router.refresh();
    } catch (error) {
      setResizeError(
        error instanceof Error
          ? error.message
          : "プロジェクトの更新に失敗しました"
      );
    } finally {
      setResizeSaving(false);
    }
  }

  async function handleTimingSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTimingError(null);
    setTimingSuccess(null);

    const panelMs = parseTimingInput(panelInput);
    const intervalMs = parseTimingInput(intervalInput);

    if (panelMs === null || intervalMs === null) {
      setTimingError("0.2〜10.0秒の範囲で、0.1秒刻みで入力してください。");
      return;
    }

    setTimingSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        default_panel_duration_ms: panelMs,
        default_interval_ms: intervalMs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (error) {
      setPanelInput(msToSecondsString(savedPanelMs));
      setIntervalInput(msToSecondsString(savedIntervalMs));
      setTimingError("設定の保存に失敗しました。表示を保存済みの値に戻しました。");
      setTimingSaving(false);
      return;
    }

    setSavedPanelMs(panelMs);
    setSavedIntervalMs(intervalMs);
    setPanelInput(msToSecondsString(panelMs));
    setIntervalInput(msToSecondsString(intervalMs));
    setTimingSuccess("基本時間を更新しました。");
    setTimingSaving(false);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  return (
    <main className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
          disabled={isBusy}
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">設定</h1>
          <p className="text-xs text-muted">{project?.name ?? ""}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {loadError && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              {loadError}
            </div>
          )}

          {project && (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-card border border-card-border rounded-lg">
                  <p className="text-xs text-muted mb-1">現在のマス数</p>
                  <p className="text-lg font-semibold">
                    {project.grid_width} × {project.grid_height}
                  </p>
                </div>
                <div className="p-4 bg-card border border-card-border rounded-lg">
                  <p className="text-xs text-muted mb-1">影響を受けるパネル</p>
                  <p className="text-lg font-semibold">{panelCount} 枚</p>
                </div>
                <div className="p-4 bg-card border border-card-border rounded-lg">
                  <p className="text-xs text-muted mb-1">ウェーブパネル</p>
                  <p className="text-lg font-semibold">{wavePanelCount} 枚</p>
                </div>
              </section>

              <form
                onSubmit={handleResizeSubmit}
                className="p-5 bg-card border border-card-border rounded-xl space-y-4"
              >
                <div>
                  <h2 className="font-medium">マス数変更</h2>
                  <p className="text-sm text-muted mt-1">
                    既存パネルを一括補正してからプロジェクトのマス数を更新します。
                  </p>
                  <p className="text-xs text-muted mt-2">
                    更新前の編集状態は、リサイズ実行ごとに履歴として自動保存されます。
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted mb-1">
                      横マス数
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={gridWidth}
                      onChange={(event) =>
                        setGridWidth(Number(event.target.value))
                      }
                      disabled={resizeSaving}
                      className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">
                      縦マス数
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={gridHeight}
                      onChange={(event) =>
                        setGridHeight(Number(event.target.value))
                      }
                      disabled={resizeSaving}
                      className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent disabled:opacity-60"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 bg-background border border-card-border rounded-lg">
                  <input
                    type="checkbox"
                    checked={autoAdjustIllustration}
                    onChange={(event) =>
                      setAutoAdjustIllustration(event.target.checked)
                    }
                    disabled={resizeSaving}
                    className="mt-1 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium">イラスト自動補正</p>
                    <p className="text-xs text-muted mt-1">
                      ON の場合、非白セルの描画領域を検出して新しいマス数に合わせて拡縮します。
                      OFF の場合は中央基準で pad / crop のみ行います。
                    </p>
                  </div>
                </label>

                {resizeError && (
                  <div className="px-3 py-2 rounded-lg bg-danger/10 text-sm text-danger">
                    {resizeError}
                  </div>
                )}

                {!isGridFormValid && (
                  <p className="text-sm text-danger">
                    マス数は 5〜200 の整数で入力してください。
                  </p>
                )}

                {hasGridChanges && isGridFormValid && (
                  <p className="text-sm text-muted">
                    更新後: {gridWidth} × {gridHeight}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${projectId}`)}
                    disabled={resizeSaving}
                    className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-60"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isResizeDisabled}
                    className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {resizeSaving ? "更新中..." : "マス数を更新"}
                  </button>
                </div>
              </form>

              <section className="p-4 bg-card border border-card-border rounded-xl">
                <h2 className="font-medium mb-2">基本時間</h2>
                <p className="text-sm text-muted leading-6">
                  ここで変更した基本時間は、個別設定していない通常パネルと折り時間に反映されます。
                  ダッシュボード再生で個別に変更した項目は、そのまま維持されます。
                </p>
              </section>

              <form
                onSubmit={handleTimingSave}
                className="p-4 bg-card border border-card-border rounded-xl space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-1">
                    通常パネルの基本表示時間
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.2}
                      max={10}
                      step={0.1}
                      value={panelInput}
                      onChange={(event) => setPanelInput(event.target.value)}
                      disabled={timingSaving}
                      className="w-32 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent disabled:opacity-60"
                    />
                    <span className="text-sm text-muted">秒</span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    現在の保存値: {msToSecondsString(savedPanelMs)}秒
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    折り時間の基本間隔
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.2}
                      max={10}
                      step={0.1}
                      value={intervalInput}
                      onChange={(event) => setIntervalInput(event.target.value)}
                      disabled={timingSaving}
                      className="w-32 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent disabled:opacity-60"
                    />
                    <span className="text-sm text-muted">秒</span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    現在の保存値: {msToSecondsString(savedIntervalMs)}秒
                  </p>
                </div>

                {timingError && (
                  <div className="px-3 py-2 rounded-lg bg-danger/10 text-sm text-danger">
                    {timingError}
                  </div>
                )}

                {timingSuccess && (
                  <div className="px-3 py-2 rounded-lg bg-accent/10 text-sm text-accent">
                    {timingSuccess}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={timingSaving}
                    className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {timingSaving ? "保存中..." : "保存"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
