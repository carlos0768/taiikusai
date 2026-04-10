"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  projectId,
  projectName,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (
        isOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [isOpen, onClose]);

  const navItems = [
    { label: "ダッシュボード", href: `/project/${projectId}` },
    { label: "テンプレ", href: `/project/${projectId}/templates` },
    { label: "設定", href: `/project/${projectId}/settings` },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full w-64 bg-card border-r border-card-border z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Project name */}
        <div className="px-4 py-4 border-b border-card-border">
          <h2 className="font-semibold text-foreground truncate">
            {projectName}
          </h2>
        </div>

        {/* Navigation */}
        <nav className="py-2">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className="block px-4 py-3 text-sm text-foreground hover:bg-accent/10 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
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
