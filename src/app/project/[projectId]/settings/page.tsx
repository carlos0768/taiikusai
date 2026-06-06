"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProjectBranchGraph from "@/components/settings/ProjectBranchGraph";
import { fetchJson } from "@/lib/client/api";
import { canEditBranch, READONLY_AUTH_PROFILE } from "@/lib/client/authProfile";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { updateProjectBranchSettings } from "@/lib/api/projects";
import { getPanelColumns, type PanelColumn } from "@/lib/panelColumns";
import { buildBranchPath } from "@/lib/projectBranches";
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
  Connection,
  ProjectBranch,
  ProjectBranchMerge,
  ZentaiGamen,
} from "@/types";

interface MeResponse {
  profile: AuthProfile;
}

interface UsersResponse {
  users: AuthProfile[];
}

interface ResizeResponse {
  project: BranchScopedProject;
  resizedPanelCount: number;
  resizedWavePanelCount: number;
}

interface PublicProjectResponse {
  projectView: BranchScopedProject;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  zentaiGamen: ZentaiGamen[];
  connections: Connection[];
}

const permissionLabels: Array<{
  key: keyof AuthProfile["permissions"];
  label: string;
}> = [
  { key: "can_view_projects", label: "プロジェクト閲覧" },
  { key: "can_create_branches", label: "ブランチ作成" },
  { key: "can_edit_branch_content", label: "作業ブランチ編集" },
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
  const [displayBranchId, setDisplayBranchId] = useState("");
  const [displayStartId, setDisplayStartId] = useState("");
  const [panelColumns, setPanelColumns] = useState<PanelColumn[]>([]);
  const [loadingPanelColumns, setLoadingPanelColumns] = useState(false);
  const [savingDisplaySettings, setSavingDisplaySettings] = useState(false);
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
    isPractice: false,
  });

  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchGraphError, setBranchGraphError] = useState<string | null>(null);

  const loadPanelColumns = useCallback(
    async (branchId: string, preferredStartId?: string | null) => {
      if (!branchId) {
        setPanelColumns([]);
        setDisplayStartId("");
        return;
      }

      setLoadingPanelColumns(true);

      try {
        const context = await fetchJson<PublicProjectResponse>(
          `/api/projects/${projectId}/public?branch=${encodeURIComponent(
            branchId
          )}`
        );

        const nextColumns = getPanelColumns(
          context.zentaiGamen,
          context.connections
        );
        const nextStartId =
          preferredStartId &&
          nextColumns.some((column) => column.startNodeId === preferredStartId)
            ? preferredStartId
            : nextColumns[0]?.startNodeId ?? "";

        setPanelColumns(nextColumns);
        setDisplayStartId(nextStartId);
      } catch (error) {
        setPanelColumns([]);
        setDisplayStartId("");
        setLoadError(
          error instanceof Error
            ? error.message
            : "パネル列を読み込めませんでした"
        );
      } finally {
        setLoadingPanelColumns(false);
      }
    },
    [projectId]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setBranchGraphError(null);

    try {
      const query = requestedBranchId
        ? `?branch=${encodeURIComponent(requestedBranchId)}`
        : "";
      const [contextResult, { data: mergeData, error: mergeError }] =
        await Promise.all([
          fetchJson<PublicProjectResponse>(
            `/api/projects/${projectId}/public${query}`
          ),
          supabase
            .from("project_branch_merges")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
        ]);

      const currentBranchPanels = contextResult.zentaiGamen;

      setProject(contextResult.projectView);
      setBranches(contextResult.branches);
      setCurrentBranch(contextResult.currentBranch);
      const configuredBranchId = contextResult.projectView.highlight_branch_id;
      const initialDisplayBranchId =
        configuredBranchId &&
        contextResult.branches.some((branch) => branch.id === configuredBranchId)
          ? configuredBranchId
          : contextResult.currentBranch.id;
      setDisplayBranchId(initialDisplayBranchId);
      await loadPanelColumns(
        initialDisplayBranchId,
        contextResult.projectView.highlight_start_zentai_gamen_id
      );
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
      setPanelCount(currentBranchPanels.length);
      setWavePanelCount(
        currentBranchPanels.filter(
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
  }, [loadPanelColumns, projectId, requestedBranchId, supabase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const { profile: nextProfile } = await fetchJson<MeResponse>("/api/auth/me");
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch {
        if (!cancelled) {
          setProfile(READONLY_AUTH_PROFILE);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      if (!profile?.is_admin && !profile?.permissions.can_manage_accounts) {
        setUsers([]);
        return;
      }

      try {
        const usersResponse = await fetchJson<UsersResponse>("/api/settings/users");
        if (!cancelled) {
          setUsers(usersResponse.users);
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
        }
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const canManageAccounts =
    profile?.is_admin || profile?.permissions.can_manage_accounts || false;
  const canEditCurrentBranch = canEditBranch(profile, currentBranch);

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
  const isBusy = resizeSaving || timingSaving || savingDisplaySettings;

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
        isPractice: false,
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
            isPractice: user.is_practice,
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

  const handleDisplayBranchChange = useCallback(
    (nextBranchId: string) => {
      setDisplayBranchId(nextBranchId);
      void loadPanelColumns(nextBranchId);
    },
    [loadPanelColumns]
  );

  const handleUpdateDisplaySettings = useCallback(async () => {
    if (!project || !profile?.is_admin) return;

    setSavingDisplaySettings(true);
    setLoadError(null);

    try {
      const response = await fetchJson<{
        project: {
          highlight_branch_id: string | null;
          highlight_start_zentai_gamen_id: string | null;
        };
      }>(
        `/api/projects/${projectId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            highlightBranchId: displayBranchId,
            highlightStartZentaiGamenId: displayStartId,
          }),
        }
      );

      setProject((current) =>
        current
          ? {
              ...current,
              highlight_branch_id: response.project.highlight_branch_id,
              highlight_start_zentai_gamen_id:
                response.project.highlight_start_zentai_gamen_id,
            }
          : current
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "表示設定を更新できませんでした"
      );
    } finally {
      setSavingDisplaySettings(false);
    }
  }, [displayBranchId, displayStartId, profile?.is_admin, project, projectId]);

  const backHref = project
    ? buildBranchPath(`/project/${projectId}`, project.active_branch_id)
    : `/project/${projectId}`;

  useEffect(() => {
    prefetchRoutes(router, [backHref]);
  }, [backHref, router]);

  if (!project || !currentBranch) {
    return (
      <div className="h-full flex items-center justify-center">
        {loadError && <p className="text-muted">{loadError}</p>}
      </div>
    );
  }

  const selectedDisplayBranch = branches.find(
    (branch) => branch.id === displayBranchId
  );
  const selectedDisplayColumn = panelColumns.find(
    (column) => column.startNodeId === displayStartId
  );

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
                  main への反映は admin 承認制です。非 admin は作業ブランチから申請してください。
                </p>
              </div>
              <span className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black">
                admin 承認制
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">表示ページ</h2>
                <p className="mt-1 text-sm text-muted">
                  {selectedDisplayBranch && selectedDisplayColumn
                    ? `${selectedDisplayBranch.name} / ${selectedDisplayColumn.label}`
                    : "表示するブランチとパネル列を選択してください。"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/project/${projectId}/highlight`)}
                className="rounded-lg border border-card-border px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
              >
                表示ページを開く
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">ブランチ</span>
                <select
                  value={displayBranchId}
                  disabled={!profile?.is_admin || branches.length === 0}
                  onChange={(event) => handleDisplayBranchChange(event.target.value)}
                  className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent disabled:opacity-40"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-muted">パネル列</span>
                <select
                  value={displayStartId}
                  disabled={
                    !profile?.is_admin ||
                    loadingPanelColumns ||
                    panelColumns.length === 0
                  }
                  onChange={(event) => setDisplayStartId(event.target.value)}
                  className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent disabled:opacity-40"
                >
                  {panelColumns.length === 0 && (
                    <option value="">
                      {loadingPanelColumns ? "読み込み中..." : "パネル列なし"}
                    </option>
                  )}
                  {panelColumns.map((column) => (
                    <option key={column.startNodeId} value={column.startNodeId}>
                      {column.label} - {column.startNodeName}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => void handleUpdateDisplaySettings()}
                disabled={
                  !profile?.is_admin ||
                  savingDisplaySettings ||
                  !displayBranchId ||
                  !displayStartId
                }
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
              >
                {savingDisplaySettings ? "保存中..." : "保存"}
              </button>
            </div>

            {!profile?.is_admin && (
              <p className="mt-3 text-sm text-muted">
                表示ページの対象変更には admin 権限が必要です。
              </p>
            )}
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
                <div className="grid gap-3 md:grid-cols-5">
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
                      disabled={createForm.isPractice}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          isAdmin: event.target.checked,
                        }))
                      }
                    />
                    admin
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.isPractice}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          isPractice: event.target.checked,
                          isAdmin: event.target.checked ? false : prev.isAdmin,
                        }))
                      }
                    />
                    practice
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
                            disabled={user.is_practice}
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
                            checked={user.is_practice}
                            onChange={(event) =>
                              setUsers((prev) =>
                                prev.map((item) =>
                                  item.id === user.id
                                    ? {
                                        ...item,
                                        is_admin: event.target.checked
                                          ? false
                                          : item.is_admin,
                                        is_practice: event.target.checked,
                                        permissions: event.target.checked
                                          ? {
                                              ...item.permissions,
                                              can_view_projects: true,
                                              can_create_branches: false,
                                              can_edit_branch_content: false,
                                              can_request_main_merge: false,
                                              can_view_git_requests: false,
                                              can_manage_accounts: false,
                                            }
                                          : item.permissions,
                                      }
                                    : item
                                )
                              )
                            }
                          />
                          practice
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
                              checked={
                                user.is_practice && permission.key === "can_view_projects"
                                  ? true
                                  : Boolean(user.permissions[permission.key])
                              }
                              disabled={user.is_admin || user.is_practice}
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
