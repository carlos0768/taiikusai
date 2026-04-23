"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProjectBranchGraph from "@/components/settings/ProjectBranchGraph";
import { fetchJson } from "@/lib/client/api";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { updateProjectBranchSettings } from "@/lib/api/projects";
import {
  buildBranchPath,
  fetchProjectBranchContext,
} from "@/lib/projectBranches";
import {
  MAX_TIMING_MS,
  MIN_TIMING_MS,
  msToSecondsString,
  TIMING_STEP_MS,
} from "@/lib/playback/timing";
import { createClient } from "@/lib/supabase/client";
import type {
  AuthProfile,
  BranchScopedProject,
  Project,
  ProjectBranch,
  ProjectBranchMerge,
  ZentaiGamen,
} from "@/types";

interface UsersResponse {
  users: AuthProfile[];
}

interface MeResponse {
  profile: AuthProfile;
}

interface ProjectResponse {
  project: Project;
}

interface ResizeResponse {
  project: BranchScopedProject;
  resizedPanelCount: number;
  resizedWavePanelCount: number;
}

const permissionLabels: Array<{
  key: keyof AuthProfile["permissions"];
  label: string;
}> = [
  { key: "can_view_projects", label: "プロジェクト閲覧" },
  { key: "can_create_branches", label: "ブランチ作成" },
  { key: "can_edit_branch_content", label: "ブランチ編集" },
  { key: "can_request_main_merge", label: "main 申請" },
  { key: "can_view_git_requests", label: "Git リクエスト閲覧" },
  { key: "can_manage_accounts", label: "アカウント管理" },
];

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "設定情報の読み込みに失敗しました";
}

function getBranchGraphErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  const refersBranchTable =
    message.includes("project_branch_merges") ||
    message.includes("project_branches");
  const isBranchConfigError =
    refersBranchTable &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("row-level security policy"));

  if (isBranchConfigError) {
    return "ブランチ用のDB設定が未適用のため、擬似Git状態を表示できません。branch 用 migration を適用してください。";
  }

  return "擬似Git状態の読み込みに失敗しました。";
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const requestedBranchId = searchParams.get("branch");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [users, setUsers] = useState<AuthProfile[]>([]);
  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [branches, setBranches] = useState<ProjectBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<ProjectBranch | null>(null);
  const [branchMerges, setBranchMerges] = useState<ProjectBranchMerge[]>([]);
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

  const [createForm, setCreateForm] = useState({
    loginId: "",
    displayName: "",
    password: "",
    isAdmin: false,
  });

  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchGraphError, setBranchGraphError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setBranchGraphError(null);

    try {
      const [me, contextResult] = await Promise.all([
        fetchJson<MeResponse>("/api/auth/me"),
        fetchProjectBranchContext(supabase, projectId, requestedBranchId),
      ]);

      const canManageAccounts =
        me.profile.is_admin || me.profile.permissions.can_manage_accounts;

      const [
        { data: panelData, error: panelError },
        { data: mergeData, error: mergeError },
        usersResult,
      ] = await Promise.all([
        supabase
          .from("zentai_gamen")
          .select("id,panel_type,motion_type")
          .eq("project_id", projectId)
          .eq("branch_id", contextResult.currentBranch.id),
        supabase
          .from("project_branch_merges")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
        canManageAccounts
          ? fetchJson<UsersResponse>("/api/settings/users")
          : Promise.resolve({ users: [] }),
      ]);

      if (panelError) {
        throw panelError;
      }

      const zentaiGamen = (panelData ?? []) as Pick<
        ZentaiGamen,
        "id" | "panel_type" | "motion_type"
      >[];

      setProfile(me.profile);
      setUsers(usersResult.users);
      setProject(contextResult.projectView);
      setBranches(contextResult.branches);
      setCurrentBranch(contextResult.currentBranch);
      setGridWidth(contextResult.projectView.grid_width);
      setGridHeight(contextResult.projectView.grid_height);
      setSavedPanelMs(contextResult.projectView.default_panel_duration_ms);
      setSavedIntervalMs(contextResult.projectView.default_interval_ms);
      setPanelInput(
        msToSecondsString(contextResult.projectView.default_panel_duration_ms)
      );
      setIntervalInput(
        msToSecondsString(contextResult.projectView.default_interval_ms)
      );
      setPanelCount(zentaiGamen.length);
      setWavePanelCount(
        zentaiGamen.filter(
          (panel) =>
            panel.panel_type === "motion" && panel.motion_type === "wave"
        ).length
      );

      if (mergeError) {
        setBranchMerges([]);
        setBranchGraphError(getBranchGraphErrorMessage(mergeError));
      } else {
        setBranchMerges((mergeData ?? []) as ProjectBranchMerge[]);
      }
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, requestedBranchId, supabase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const canManageAccounts =
    profile?.is_admin || profile?.permissions.can_manage_accounts || false;
  const canEditCurrentBranch = Boolean(
    profile &&
      project &&
      (profile.is_admin ||
        (profile.permissions.can_edit_branch_content &&
          (!currentBranch?.is_main ||
            !project.main_branch_requires_admin_approval)))
  );

  const hasGridChanges =
    project !== null &&
    (gridWidth !== project.grid_width || gridHeight !== project.grid_height);
  const isGridFormValid =
    isValidGridSize(gridWidth) && isValidGridSize(gridHeight);
  const isResizeDisabled =
    loading ||
    resizeSaving ||
    !project ||
    !hasGridChanges ||
    !isGridFormValid ||
    !canEditCurrentBranch;
  const isBusy = resizeSaving || timingSaving;

  async function handleResizeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isResizeDisabled || !project) return;

    setResizeSaving(true);
    setResizeError(null);

    try {
      const response = await fetch(
        buildBranchPath(`/api/projects/${projectId}/resize`, project.active_branch_id),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gridWidth,
            gridHeight,
            autoAdjustIllustration,
          }),
        }
      );

      const result = (await response.json()) as
        | ResizeResponse
        | { error?: string };

      if (!response.ok || !("project" in result)) {
        throw new Error(
          "error" in result ? result.error : "プロジェクトの更新に失敗しました"
        );
      }

      const successMessage =
        `${result.resizedPanelCount} 枚のパネルを ${gridWidth} × ${gridHeight} に更新しました。` +
        (result.resizedWavePanelCount > 0
          ? ` ウェーブ ${result.resizedWavePanelCount} 枚も補正済みです。`
          : "");

      alert(successMessage);
      await loadSettings();
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
    if (!project || !canEditCurrentBranch) return;

    setTimingError(null);
    setTimingSuccess(null);

    const panelMs = parseTimingInput(panelInput);
    const intervalMs = parseTimingInput(intervalInput);

    if (panelMs === null || intervalMs === null) {
      setTimingError("0.2〜10.0秒の範囲で、0.1秒刻みで入力してください。");
      return;
    }

    setTimingSaving(true);
    try {
      await updateProjectBranchSettings(
        projectId,
        project.active_branch_id,
        {
          default_panel_duration_ms: panelMs,
          default_interval_ms: intervalMs,
        },
        project.active_branch_is_main
      );

      setSavedPanelMs(panelMs);
      setSavedIntervalMs(intervalMs);
      setPanelInput(msToSecondsString(panelMs));
      setIntervalInput(msToSecondsString(intervalMs));
      setTimingSuccess("基本時間を更新しました。");
      await loadSettings();
    } catch {
      setPanelInput(msToSecondsString(savedPanelMs));
      setIntervalInput(msToSecondsString(savedIntervalMs));
      setTimingError("設定の保存に失敗しました。表示を保存済みの値に戻しました。");
    } finally {
      setTimingSaving(false);
    }
  }

  const handleCreateUser = useCallback(async () => {
    try {
      const response = await fetchJson<UsersResponse & { success: boolean }>(
        "/api/settings/users",
        {
          method: "POST",
          body: JSON.stringify({
            ...createForm,
            permissions: {
              can_view_projects: true,
            },
          }),
        }
      );

      setUsers(response.users);
      setCreateForm({
        loginId: "",
        displayName: "",
        password: "",
        isAdmin: false,
      });
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "アカウントを作成できませんでした"
      );
    }
  }, [createForm]);

  const handleUpdateUser = useCallback(async (user: AuthProfile) => {
    try {
      const response = await fetchJson<UsersResponse & { success: boolean }>(
        `/api/settings/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: user.display_name,
            isAdmin: user.is_admin,
            status: user.status,
            gitNotificationsEnabled: user.git_notifications_enabled,
            permissions: user.permissions,
          }),
        }
      );

      setUsers(response.users);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "ユーザーを更新できませんでした"
      );
    }
  }, []);

  const handleToggleMainProtection = useCallback(async () => {
    if (!project) return;

    try {
      const response = await fetchJson<ProjectResponse & { success: boolean }>(
        `/api/projects/${projectId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            mainBranchRequiresAdminApproval:
              !project.main_branch_requires_admin_approval,
          }),
        }
      );

      setProject((prev) =>
        prev
          ? {
              ...prev,
              main_branch_requires_admin_approval:
                response.project.main_branch_requires_admin_approval,
            }
          : prev
      );
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "設定を更新できませんでした"
      );
    }
  }, [project, projectId]);

  const backHref = project
    ? buildBranchPath(`/project/${projectId}`, project.active_branch_id)
    : `/project/${projectId}`;

  useEffect(() => {
    prefetchRoutes(router, [backHref]);
  }, [backHref, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!profile || !project || !currentBranch) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">{loadError ?? "設定を読み込めませんでした"}</p>
      </div>
    );
  }

  return (
    <main className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(backHref)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
          disabled={isBusy}
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">設定</h1>
          <p className="text-xs text-muted">
            {project.name} / {currentBranch.name}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {loadError && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              {loadError}
            </div>
          )}

          <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-card border border-card-border rounded-lg">
              <p className="text-xs text-muted mb-1">現在のブランチ</p>
              <p className="text-lg font-semibold">{currentBranch.name}</p>
            </div>
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

          <section className="p-5 bg-card border border-card-border rounded-xl space-y-4">
            <div>
              <h2 className="font-medium">擬似Git状態</h2>
              <p className="text-sm text-muted mt-1">
                branch 作成時の分岐と、main への merge を図で表示します。
              </p>
            </div>

            {branchGraphError && (
              <div className="px-3 py-2 rounded-lg bg-danger/10 text-sm text-danger">
                {branchGraphError}
              </div>
            )}

            {!branchGraphError && (
              <ProjectBranchGraph
                branches={branches}
                merges={branchMerges}
                currentBranchId={currentBranch.id}
              />
            )}
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">main ブランチ保護</h2>
                <p className="text-sm text-muted mt-1">
                  ON の場合、admin 以外は `main` を直接編集できず申請が必要です。
                </p>
              </div>
              <button
                onClick={() => void handleToggleMainProtection()}
                disabled={!canManageAccounts}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                  project.main_branch_requires_admin_approval
                    ? "bg-accent text-black"
                    : "bg-card-border text-foreground"
                }`}
              >
                {project.main_branch_requires_admin_approval ? "保護中" : "保護OFF"}
              </button>
            </div>
          </section>

          <form
            onSubmit={handleResizeSubmit}
            className="p-5 bg-card border border-card-border rounded-xl space-y-4"
          >
            <div>
              <h2 className="font-medium">マス数変更</h2>
              <p className="text-sm text-muted mt-1">
                現在の branch のパネルだけを一括補正してからマス数を更新します。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted mb-1">横マス数</label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={gridWidth}
                  onChange={(event) => setGridWidth(Number(event.target.value))}
                  disabled={resizeSaving || !canEditCurrentBranch}
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">縦マス数</label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={gridHeight}
                  onChange={(event) => setGridHeight(Number(event.target.value))}
                  disabled={resizeSaving || !canEditCurrentBranch}
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
                disabled={resizeSaving || !canEditCurrentBranch}
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

            {!canEditCurrentBranch && (
              <p className="text-sm text-muted">
                このブランチの設定を変更する権限がありません。
              </p>
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
                onClick={() => router.push(backHref)}
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
              ここで変更した基本時間は、この branch の通常パネルと折り時間に反映されます。
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
                  disabled={timingSaving || !canEditCurrentBranch}
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
                  disabled={timingSaving || !canEditCurrentBranch}
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
                disabled={timingSaving || !canEditCurrentBranch}
                className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {timingSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">通知</h2>
            <p className="text-sm text-muted">
              Git リクエスト通知は各アカウントごとに ON/OFF できます。管理者向け通知は下のアカウント設定から変更できます。
            </p>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">アカウント</h2>

            {!canManageAccounts && (
              <p className="text-sm text-muted">
                アカウント管理権限がありません。
              </p>
            )}

            {canManageAccounts && (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <input
                    value={createForm.loginId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        loginId: event.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="login id"
                    className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                  <input
                    value={createForm.displayName}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        displayName: event.target.value,
                      }))
                    }
                    placeholder="表示名"
                    className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    placeholder="初期パスワード"
                    className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                  <label className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.isAdmin}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          isAdmin: event.target.checked,
                        }))
                      }
                    />
                    admin
                  </label>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => void handleCreateUser()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity"
                  >
                    新規アカウント作成
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-xl border border-card-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          value={user.display_name}
                          onChange={(event) =>
                            setUsers((prev) =>
                              prev.map((item) =>
                                item.id === user.id
                                  ? { ...item, display_name: event.target.value }
                                  : item
                              )
                            )
                          }
                          className="min-w-[180px] rounded-lg border border-card-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        />
                        <span className="rounded-full bg-card px-3 py-1 text-xs text-muted">
                          ID: {user.login_id}
                        </span>
                        <label className="flex items-center gap-2 text-sm text-muted">
                          <input
                            type="checkbox"
                            checked={user.is_admin}
                            onChange={(event) =>
                              setUsers((prev) =>
                                prev.map((item) =>
                                  item.id === user.id
                                    ? { ...item, is_admin: event.target.checked }
                                    : item
                                )
                              )
                            }
                          />
                          admin
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted">
                          <input
                            type="checkbox"
                            checked={user.git_notifications_enabled}
                            onChange={(event) =>
                              setUsers((prev) =>
                                prev.map((item) =>
                                  item.id === user.id
                                    ? {
                                        ...item,
                                        git_notifications_enabled: event.target.checked,
                                      }
                                    : item
                                )
                              )
                            }
                          />
                          Git通知
                        </label>
                        <select
                          value={user.status}
                          onChange={(event) =>
                            setUsers((prev) =>
                              prev.map((item) =>
                                item.id === user.id
                                  ? {
                                      ...item,
                                      status: event.target.value as AuthProfile["status"],
                                    }
                                  : item
                              )
                            )
                          }
                          className="rounded-lg border border-card-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        >
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {permissionLabels.map((permission) => (
                          <label
                            key={permission.key}
                            className="flex items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(user.permissions[permission.key])}
                              disabled={user.is_admin}
                              onChange={(event) =>
                                setUsers((prev) =>
                                  prev.map((item) =>
                                    item.id === user.id
                                      ? {
                                          ...item,
                                          permissions: {
                                            ...item.permissions,
                                            [permission.key]: event.target.checked,
                                          },
                                        }
                                      : item
                                  )
                                )
                              }
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => void handleUpdateUser(user)}
                          className="rounded-lg border border-card-border px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
