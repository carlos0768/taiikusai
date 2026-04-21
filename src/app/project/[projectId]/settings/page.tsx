"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Project, ZentaiGamen } from "@/types";

interface ResizeResponse {
  project: Project;
  resizedPanelCount: number;
  resizedWavePanelCount: number;
}

function isValidGridSize(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 200;
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [project, setProject] = useState<Project | null>(null);
  const [panelCount, setPanelCount] = useState(0);
  const [wavePanelCount, setWavePanelCount] = useState(0);
  const [gridWidth, setGridWidth] = useState(50);
  const [gridHeight, setGridHeight] = useState(30);
  const [autoAdjustIllustration, setAutoAdjustIllustration] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setErrorMessage(null);

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
        setErrorMessage("設定情報の読み込みに失敗しました");
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

  const hasChanges =
    project !== null &&
    (gridWidth !== project.grid_width || gridHeight !== project.grid_height);
  const isFormValid = isValidGridSize(gridWidth) && isValidGridSize(gridHeight);
  const isSubmitDisabled =
    loading || saving || !project || !hasChanges || !isFormValid;

  async function handleResizeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitDisabled) return;

    setSaving(true);
    setErrorMessage(null);

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
        const error =
          "error" in result ? result.error : undefined;
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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "プロジェクトの更新に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
          disabled={saving}
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">設定</h1>
          {project && (
            <p className="text-xs text-muted">{project.name}</p>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {loading && (
            <p className="text-muted text-center py-12">読み込み中...</p>
          )}

          {!loading && errorMessage && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              {errorMessage}
            </div>
          )}

          {!loading && project && (
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
                className="p-5 bg-card border border-card-border rounded-lg space-y-4"
              >
                <div>
                  <h2 className="font-medium">マス数変更</h2>
                  <p className="text-sm text-muted mt-1">
                    既存パネルを一括補正してからプロジェクトのマス数を更新します。
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
                      disabled={saving}
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
                      disabled={saving}
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
                    disabled={saving}
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

                {!isFormValid && (
                  <p className="text-sm text-danger">
                    マス数は 5〜200 の整数で入力してください。
                  </p>
                )}

                {hasChanges && isFormValid && (
                  <p className="text-sm text-muted">
                    更新後: {gridWidth} × {gridHeight}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${projectId}`)}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors disabled:opacity-60"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitDisabled}
                    className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "更新中..." : "マス数を更新"}
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
