"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(50);
  const [newHeight, setNewHeight] = useState(30);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: newName.trim(),
        grid_width: newWidth,
        grid_height: newHeight,
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/project/${data.id}`);
    }
    setCreating(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await supabase.from("projects").delete().eq("id", id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-card-border">
        <h1 className="text-xl font-bold">taiikusai</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ログアウト
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">プロジェクト</h2>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              + 新規プロジェクト
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
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
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                  placeholder="例: 2026年度 赤組"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">
                    横マス数
                  </label>
                  <input
                    type="number"
                    value={newWidth}
                    onChange={(e) => setNewWidth(Number(e.target.value))}
                    min={5}
                    max={200}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1">
                    縦マス数
                  </label>
                  <input
                    type="number"
                    value={newHeight}
                    onChange={(e) => setNewHeight(Number(e.target.value))}
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

          {/* Loading */}
          {loading && (
            <p className="text-muted text-center py-12">読み込み中...</p>
          )}

          {/* Empty state */}
          {!loading && projects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted mb-2">
                プロジェクトがありません
              </p>
              <p className="text-sm text-muted">
                「新規プロジェクト」からパネルデザインを始めましょう
              </p>
            </div>
          )}

          {/* Project list */}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id, project.name);
                  }}
                  className="text-sm text-muted hover:text-danger transition-colors px-2 py-1"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
