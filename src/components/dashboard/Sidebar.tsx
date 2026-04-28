"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  branchId: string;
  showGitBadge: boolean;
  showGit: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  projectId,
  projectName,
  branchId,
  showGitBadge,
  showGit,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (
        isOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [isOpen, onClose]);

  const navItems = useMemo(
    () => [
      {
        label: "ダッシュボード",
        href: buildBranchPath(`/project/${projectId}`, branchId),
      },
      {
        label: "テンプレ",
        href: buildBranchPath(`/project/${projectId}/templates`, branchId),
      },
      {
        label: "生成テスト",
        href: buildBranchPath(`/project/${projectId}/text-to-panel`, branchId),
      },
      ...(showGit
        ? [
            {
              label: "Git",
              href: buildBranchPath(`/project/${projectId}/git/requests`, branchId),
              showBadge: showGitBadge,
            },
          ]
        : []),
      {
        label: "設定",
        href: buildBranchPath(`/project/${projectId}/settings`, branchId),
      },
    ],
    [branchId, projectId, showGit, showGitBadge]
  );

  useEffect(() => {
    prefetchRoutes(router, [...navItems.map((item) => item.href), "/dashboard"]);
  }, [navItems, router]);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" />
      )}

      <div
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full w-64 bg-card border-r border-card-border z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-4 border-b border-card-border">
          <h2 className="font-semibold text-foreground truncate">
            {projectName}
          </h2>
        </div>

        <nav className="py-2">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className="relative block px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
            >
              {item.label}
              {item.showBadge && (
                <span className="absolute right-4 top-3.5 h-2.5 w-2.5 rounded-full bg-sky-500" />
              )}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-card-border p-4">
          <Link
            href="/dashboard"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            ← プロジェクト一覧
          </Link>
        </div>
      </div>
    </>
  );
}
