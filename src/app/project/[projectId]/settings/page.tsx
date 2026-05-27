"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import { createClient } from "@/lib/supabase/client";
import { getPanelColumns, type PanelColumn } from "@/lib/panelColumns";
import type {
  AuthProfile,
  BranchContextResponse,
  Connection,
  Project,
  ProjectBranch,
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

function branchQuery(branchName: string) {
  return branchName === "main" ? "" : `?branch=${branchName}`;
}

export default function SettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const branchName = searchParams.get("branch") ?? "main";
  const [supabase] = useState(() => createClient());

  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<ProjectBranch[]>([]);
  const [displayBranchId, setDisplayBranchId] = useState("");
  const [displayStartId, setDisplayStartId] = useState("");
  const [panelColumns, setPanelColumns] = useState<PanelColumn[]>([]);
  const [loadingPanelColumns, setLoadingPanelColumns] = useState(false);
  const [savingDisplaySettings, setSavingDisplaySettings] = useState(false);
  const [users, setUsers] = useState<AuthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    loginId: "",
    displayName: "",
    password: "",
    isAdmin: false,
  });

  const loadPanelColumns = useCallback(
    async (branchId: string, preferredStartId?: string | null) => {
      if (!branchId) {
        setPanelColumns([]);
        setDisplayStartId("");
        return;
      }

      setLoadingPanelColumns(true);

      try {
        const [
          { data: nextZentaiGamen, error: zentaiGamenError },
          { data: nextConnections, error: connectionsError },
        ] = await Promise.all([
          supabase
            .from("zentai_gamen")
            .select("*")
            .eq("project_id", projectId)
            .eq("branch_id", branchId)
            .order("created_at", { ascending: true }),
          supabase
            .from("connections")
            .select("*")
            .eq("project_id", projectId)
            .eq("branch_id", branchId)
            .order("sort_order", { ascending: true }),
        ]);

        if (zentaiGamenError) {
          throw zentaiGamenError;
        }
        if (connectionsError) {
          throw connectionsError;
        }

        const nextColumns = getPanelColumns(
          (nextZentaiGamen ?? []) as ZentaiGamen[],
          (nextConnections ?? []) as Connection[]
        );
        const nextStartId =
          preferredStartId &&
          nextColumns.some((column) => column.startNodeId === preferredStartId)
            ? preferredStartId
            : nextColumns[0]?.startNodeId ?? "";

        setPanelColumns(nextColumns);
        setDisplayStartId(nextStartId);
      } catch (err) {
        setPanelColumns([]);
        setDisplayStartId("");
        setError(
          err instanceof Error
            ? err.message
            : "パネル列を読み込めませんでした"
        );
      } finally {
        setLoadingPanelColumns(false);
      }
    },
    [projectId, supabase]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [me, projectResponse, branchContext] = await Promise.all([
        fetchJson<MeResponse>("/api/auth/me"),
        fetchJson<ProjectResponse>(`/api/projects/${projectId}`),
        fetchJson<BranchContextResponse>(
          `/api/projects/${projectId}/branches?branch=${branchName}`
        ),
      ]);

      setProfile(me.profile);
      setProject(projectResponse.project);
      setBranches(branchContext.branches);

      const configuredBranchId = projectResponse.project.highlight_branch_id;
      const initialDisplayBranchId =
        configuredBranchId &&
        branchContext.branches.some((branch) => branch.id === configuredBranchId)
          ? configuredBranchId
          : branchContext.currentBranch.id;
      setDisplayBranchId(initialDisplayBranchId);
      await loadPanelColumns(
        initialDisplayBranchId,
        projectResponse.project.highlight_start_zentai_gamen_id
      );

      if (me.profile.is_admin || me.profile.permissions.can_manage_accounts) {
        const usersResponse = await fetchJson<UsersResponse>("/api/settings/users");
        setUsers(usersResponse.users);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, [branchName, loadPanelColumns, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "アカウントを作成できませんでした");
    }
  }, [createForm]);

  const handleUpdateUser = useCallback(
    async (user: AuthProfile) => {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "ユーザーを更新できませんでした");
      }
    },
    []
  );

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

      setProject(response.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定を更新できませんでした");
    }
  }, [project, projectId]);

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
    setError(null);

    try {
      const response = await fetchJson<ProjectResponse & { success: boolean }>(
        `/api/projects/${projectId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            highlightBranchId: displayBranchId,
            highlightStartZentaiGamenId: displayStartId,
          }),
        }
      );

      setProject(response.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "表示設定を更新できませんでした");
    } finally {
      setSavingDisplaySettings(false);
    }
  }, [displayBranchId, displayStartId, profile?.is_admin, project, projectId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!profile || !project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">{error ?? "設定を読み込めませんでした"}</p>
      </div>
    );
  }

  const canManageAccounts = profile.is_admin || profile.permissions.can_manage_accounts;
  const selectedDisplayBranch = branches.find(
    (branch) => branch.id === displayBranchId
  );
  const selectedDisplayColumn = panelColumns.find(
    (column) => column.startNodeId === displayStartId
  );

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(`/project/${projectId}${branchQuery(branchName)}`)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">設定</h1>
          <p className="text-xs text-muted">アカウント / 権限 / 擬似Git / 通知</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <section className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">擬似Git</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">main ブランチ保護</p>
                <p className="text-sm text-muted mt-1">
                  ON の場合、admin 以外は `main` を直接編集できず申請が必要です。
                </p>
              </div>
              <button
                onClick={handleToggleMainProtection}
                disabled={!canManageAccounts}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  project.main_branch_requires_admin_approval
                    ? "bg-accent text-black"
                    : "bg-card-border text-foreground"
                } disabled:opacity-40`}
              >
                {project.main_branch_requires_admin_approval ? "保護中" : "保護OFF"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">通知</h2>
            <p className="text-sm text-muted">
              Git リクエスト通知は各アカウントごとに ON/OFF できます。管理者向け通知は下のアカウント設定から変更できます。
            </p>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">表示ページ</h2>
                <p className="mt-1 text-sm text-muted">
                  {selectedDisplayBranch && selectedDisplayColumn
                    ? `${selectedDisplayBranch.name} / ${selectedDisplayColumn.label}`
                    : "未設定"}
                </p>
              </div>
              <button
                onClick={() => router.push(`/project/${projectId}/highlight`)}
                className="rounded-lg border border-card-border px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
              >
                表示ページを開く
              </button>
            </div>

            {!profile.is_admin && (
              <p className="text-sm text-muted">admin のみ変更できます。</p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">ブランチ</span>
                <select
                  value={displayBranchId}
                  disabled={!profile.is_admin || branches.length === 0}
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
                    !profile.is_admin ||
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
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void handleUpdateDisplaySettings()}
                disabled={
                  !profile.is_admin ||
                  !displayBranchId ||
                  !displayStartId ||
                  savingDisplaySettings
                }
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {savingDisplaySettings ? "保存中..." : "保存"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">アカウント</h2>
            {!canManageAccounts && (
              <p className="text-sm text-muted">アカウント管理権限がありません。</p>
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
                    onClick={handleCreateUser}
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
                                    ? {
                                        ...item,
                                        is_admin: event.target.checked,
                                      }
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
    </div>
  );
}
