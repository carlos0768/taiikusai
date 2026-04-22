"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import type { AuthProfile, Project } from "@/types";

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

  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<AuthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    loginId: "",
    displayName: "",
    password: "",
    isAdmin: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [me, projectResponse] = await Promise.all([
        fetchJson<MeResponse>("/api/auth/me"),
        fetchJson<ProjectResponse>(`/api/projects/${projectId}`),
      ]);

      setProfile(me.profile);
      setProject(projectResponse.project);

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
  }, [projectId]);

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
