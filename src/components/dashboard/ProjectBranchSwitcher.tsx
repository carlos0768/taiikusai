"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildBranchPath } from "@/lib/projectBranches";
import type { ProjectBranch } from "@/types";

interface ProjectBranchSwitcherProps {
  projectId: string;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
}

function BranchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4 4.8v4.2c0 1.1.9 2 2 2H12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M4 4.8v8.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ProjectBranchSwitcher({
  projectId,
  branches,
  currentBranch,
}: ProjectBranchSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  async function handleCreateBranch() {
    const name = prompt("新しいブランチ名を入力してください");
    if (!name) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceBranchId: currentBranch.id,
        }),
      });
      const result = (await response.json()) as
        | { branch: ProjectBranch }
        | { error?: string };

      if (!response.ok || !("branch" in result)) {
        throw new Error(
          "error" in result ? result.error : "ブランチの作成に失敗しました"
        );
      }

      setOpen(false);
      router.push(buildBranchPath(pathname, result.branch.id));
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "ブランチの作成に失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMergeToMain() {
    const confirmed = confirm(
      `「${currentBranch.name}」の最新状態を main に取り込みますか？`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/branches/${currentBranch.id}/merge`,
        { method: "POST" }
      );
      const result = (await response.json()) as
        | { mainBranch: ProjectBranch }
        | { error?: string };

      if (!response.ok || !("mainBranch" in result)) {
        throw new Error(
          "error" in result ? result.error : "main への merge に失敗しました"
        );
      }

      alert("main に merge しました。");
      setOpen(false);
      router.push(buildBranchPath(pathname, result.mainBranch.id));
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "main への merge に失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBranch() {
    const confirmed = confirm(`「${currentBranch.name}」を削除しますか？`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/branches/${currentBranch.id}`,
        { method: "DELETE" }
      );
      const result = (await response.json()) as
        | { fallbackBranchId: string }
        | { error?: string };

      if (!response.ok || !("fallbackBranchId" in result)) {
        throw new Error(
          "error" in result ? result.error : "ブランチの削除に失敗しました"
        );
      }

      setOpen(false);
      router.push(buildBranchPath(pathname, result.fallbackBranchId));
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "ブランチの削除に失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSelectBranch(branchId: string) {
    setOpen(false);
    router.push(buildBranchPath(pathname, branchId));
  }

  return (
    <div ref={containerRef} className="absolute top-4 left-16 z-30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-3 py-2 text-foreground shadow-sm hover:border-accent/50 disabled:opacity-60"
      >
        <span className="text-muted">
          <BranchIcon />
        </span>
        <span className="max-w-[160px] truncate text-sm font-medium">
          {currentBranch.name}
        </span>
        <span className="text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 w-64 overflow-hidden rounded-xl border border-card-border bg-card shadow-xl">
          <div className="border-b border-card-border px-3 py-2 text-xs text-muted">
            ブランチ
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => handleSelectBranch(branch.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-background ${
                  branch.id === currentBranch.id ? "bg-background" : ""
                }`}
              >
                <span className="truncate">{branch.name}</span>
                {branch.is_main && (
                  <span className="text-[11px] text-muted">main</span>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-card-border p-2">
            <button
              type="button"
              onClick={() => {
                void handleCreateBranch();
              }}
              disabled={busy}
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background disabled:opacity-60"
            >
              新しいブランチを作成
            </button>

            {!currentBranch.is_main && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handleMergeToMain();
                  }}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background disabled:opacity-60"
                >
                  main に merge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteBranch();
                  }}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  ブランチを削除
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
