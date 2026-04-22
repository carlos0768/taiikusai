"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import type { AuthProfile, Project } from "@/types";

interface MeResponse {
  profile: AuthProfile;
}

export default function DashboardPage() {
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(50);
  const [newHeight, setNewHeight] = useState(30);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canManageProjects =
    profile?.is_admin || profile?.permissions.can_edit_branch_content;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [{ profile: me }, projectResult] = await Promise.all([
        fetchJson<MeResponse>("/api/auth/me"),
        supabase
          .from("projects")
          .select("*")
          .order("updated_at", { ascending: false }),
      ]);

      setProfile(me);
      if (me.is_admin || me.permissions.can_view_projects) {
        if (projectResult.error) {
          throw projectResult.error;
        }
        setProjects((projectResult.data ?? []) as Project[]);
      } else {
        setProjects([]);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ダッシュボードの読み込みに失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !canManageProjects) return;

    setCreating(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("認証情報を確認できませんでした");
      }

      const { data, error: insertError } = await supabase
        .from("projects")
        .insert({
          owner_id: user.id,
          name: newName.trim(),
          grid_width: newWidth,
          grid_height: newHeight,
          main_branch_requires_admin_approval: true,
        })
        .select()
        .single();

      if (insertError || !data) {
        throw insertError ?? new Error("プロジェクトを作成できませんでした");
      }

      router.push(`/project/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プロジェクトを作成できませんでした");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!canManageProjects) return;
    if (!confirm(`「${name}」を削除しますか？`)) return;

    try {
      const { error: deleteError } = await supabase.from("projects").delete().eq("id", id);
      if (deleteError) {
        throw deleteError;
      }
      setProjects((prev) => prev.filter((project) => project.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="h-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-card-border">
        <div>
          <h1 className="text-xl font-bold">taiikusai</h1>
          {profile && (
            <p className="text-xs text-muted mt-1">
              {profile.display_name} ({profile.login_id})
            </p>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ログアウト
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">プロジェクト</h2>
            {canManageProjects && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                + 新規プロジェクト
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {!loading && profile && !profile.is_admin && !profile.permissions.can_view_projects && (
            <div className="rounded-xl border border-card-border bg-card px-6 py-8 text-center">
              <p className="text-muted">プロジェクトの閲覧権限がありません。</p>
            </div>
          )}

          {showCreate && canManageProjects && (
            <form
              onSubmit={handleCreate}
              className="mb-6 p-4 bg-card border border-card-border rounded-lg space-y-3"
            >
              <div>
                <label className="block text-sm text-muted mb-1">
                  プロジェクト名
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                  placeholder="例: 2026年度 赤組"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">横マス数</label>
                  <input
                    type="number"
                    value={newWidth}
                    onChange={(event) => setNewWidth(Number(event.target.value))}
                    min={5}
                    max={200}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">縦マス数</label>
                  <input
                    type="number"
                    value={newHeight}
                    onChange={(event) => setNewHeight(Number(event.target.value))}
                    min={5}
                    max={200}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "作成中..." : "作成"}
                </button>
              </div>
            </form>
          )}

          {loading && <p className="text-muted text-center py-12">読み込み中...</p>}

          {!loading && projects.length === 0 && profile && (profile.is_admin || profile.permissions.can_view_projects) && (
            <div className="text-center py-12">
              <p className="text-muted mb-2">プロジェクトがありません</p>
              <p className="text-sm text-muted">
                {canManageProjects
                  ? "「新規プロジェクト」からパネルデザインを始めましょう"
                  : "管理者にプロジェクトを作成してもらってください"}
              </p>
            </div>
          )}

          <div className="grid gap-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-4 bg-card border border-card-border rounded-lg hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/project/${project.id}`)}
              >
                <div>
                  <h3 className="font-medium">{project.name}</h3>
                  <p className="text-sm text-muted mt-1">
                    {project.grid_width} x {project.grid_height} マス
                  </p>
                </div>
                {canManageProjects && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(project.id, project.name);
                    }}
                    className="text-sm text-muted hover:text-danger transition-colors px-2 py-1"
                  >
                    削除
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
