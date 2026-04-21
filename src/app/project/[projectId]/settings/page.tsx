"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_TIMING_MS,
  MIN_TIMING_MS,
  msToSecondsString,
  TIMING_STEP_MS,
} from "@/lib/playback/timing";

function parseTimingInput(value: string): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  const ms = Math.round(seconds * 1000);
  if (ms < MIN_TIMING_MS || ms > MAX_TIMING_MS) return null;
  if (ms % TIMING_STEP_MS !== 0) return null;
  return ms;
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [panelInput, setPanelInput] = useState("2.0");
  const [intervalInput, setIntervalInput] = useState("1.0");
  const [savedPanelMs, setSavedPanelMs] = useState(2000);
  const [savedIntervalMs, setSavedIntervalMs] = useState(1000);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("projects")
        .select("name, default_panel_duration_ms, default_interval_ms")
        .eq("id", projectId)
        .single();

      if (data) {
        setProjectName(data.name);
        setSavedPanelMs(data.default_panel_duration_ms);
        setSavedIntervalMs(data.default_interval_ms);
        setPanelInput(msToSecondsString(data.default_panel_duration_ms));
        setIntervalInput(msToSecondsString(data.default_interval_ms));
      }
      setLoading(false);
    }

    load();
  }, [projectId, supabase]);

  const handleSave = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError("");
      setSuccess("");

      const panelMs = parseTimingInput(panelInput);
      const intervalMs = parseTimingInput(intervalInput);

      if (panelMs === null || intervalMs === null) {
        setError("0.2〜10.0秒の範囲で、0.1秒刻みで入力してください。");
        return;
      }

      setSaving(true);
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          default_panel_duration_ms: panelMs,
          default_interval_ms: intervalMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (updateError) {
        setPanelInput(msToSecondsString(savedPanelMs));
        setIntervalInput(msToSecondsString(savedIntervalMs));
        setError("設定の保存に失敗しました。表示を保存済みの値に戻しました。");
        setSaving(false);
        return;
      }

      setSavedPanelMs(panelMs);
      setSavedIntervalMs(intervalMs);
      setPanelInput(msToSecondsString(panelMs));
      setIntervalInput(msToSecondsString(intervalMs));
      setSuccess("基本時間を更新しました。");
      setSaving(false);
    },
    [intervalInput, panelInput, projectId, savedIntervalMs, savedPanelMs, supabase]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">設定</h1>
          <p className="text-xs text-muted">{projectName}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto">
          <div className="mb-5 p-4 bg-card border border-card-border rounded-xl">
            <h2 className="font-medium mb-2">基本時間</h2>
            <p className="text-sm text-muted leading-6">
              ここで変更した基本時間は、個別設定していない通常パネルと折り時間に反映されます。
              ダッシュボード再生で個別に変更した項目は、そのまま維持されます。
            </p>
          </div>

          <form
            onSubmit={handleSave}
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
                  onChange={(e) => setPanelInput(e.target.value)}
                  className="w-32 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
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
                  onChange={(e) => setIntervalInput(e.target.value)}
                  className="w-32 px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                />
                <span className="text-sm text-muted">秒</span>
              </div>
              <p className="text-xs text-muted mt-1">
                現在の保存値: {msToSecondsString(savedIntervalMs)}秒
              </p>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-danger/10 text-sm text-danger">
                {error}
              </div>
            )}
            {success && (
              <div className="px-3 py-2 rounded-lg bg-accent/10 text-sm text-accent">
                {success}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
