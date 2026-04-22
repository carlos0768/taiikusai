"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import type { ColorIndex, GridData } from "@/lib/grid/types";
import { encodeGrid } from "@/lib/grid/codec";
import { generateThumbnailDataUrl } from "@/lib/grid/thumbnail";
import type { AuthProfile, Project, ProjectBranch } from "@/types";
import { createTemplate } from "@/lib/api/templates";
import { useGridState, type Tool } from "./useGridState";
import ColorPalette from "./ColorPalette";
import EditorToolbar from "./EditorToolbar";
import GridCanvas from "./GridCanvas";
import type { Viewport } from "./gridRenderer";
import TemplateSaveDialog from "@/components/templates/TemplateSaveDialog";

interface GridEditorProps {
  initialGrid: GridData;
  zentaiGamenId: string;
  projectId: string;
  initialName: string;
  initialMemo: string;
  onSave: (gridData: string, name: string, memo: string) => Promise<void>;
  onExport: () => void;
  auth: AuthProfile;
  project: Project;
  currentBranch: ProjectBranch;
  branches: ProjectBranch[];
  unreadGitNotifications: number;
  canEditCurrentBranch: boolean;
  canCreateBranches: boolean;
  canRequestMerge: boolean;
}

function branchQuery(branchName: string) {
  return branchName === "main" ? "" : `?branch=${branchName}`;
}

export default function GridEditor({
  initialGrid,
  zentaiGamenId,
  projectId,
  initialName,
  initialMemo,
  onSave,
  onExport,
  currentBranch,
  branches,
  unreadGitNotifications,
  canEditCurrentBranch,
  canCreateBranches,
  canRequestMerge,
}: GridEditorProps) {
  const {
    gridRef,
    revision,
    dirty,
    startBatchPaint,
    batchPaintCell,
    floodFill,
    rectFill,
    undo,
    redo,
    clearDirty,
    canUndo,
    canRedo,
  } = useGridState(initialGrid);

  const [isEditing, setIsEditing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("paint");
  const [activeColor, setActiveColor] = useState<ColorIndex>(1);
  const [viewport, setViewport] = useState<Viewport>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [selection, setSelection] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [name, setName] = useState(initialName);
  const [memo, setMemo] = useState(initialMemo);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const currentBranchQuery = branchQuery(currentBranch.name);

  useEffect(() => {
    if (!dirty || !canEditCurrentBranch) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const encoded = encodeGrid(gridRef.current!);
        await onSave(encoded, name, memo);
        clearDirty();
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [revision, dirty, name, memo, onSave, gridRef, clearDirty, canEditCurrentBranch]);

  useEffect(() => {
    if (!canEditCurrentBranch) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const encoded = encodeGrid(gridRef.current!);
        await onSave(encoded, name, memo);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [name, memo, onSave, gridRef, canEditCurrentBranch]);

  const handleFillSelection = useCallback(() => {
    if (!selection || !canEditCurrentBranch) return;
    rectFill(selection.x1, selection.y1, selection.x2, selection.y2, activeColor);
    setSelection(null);
  }, [activeColor, canEditCurrentBranch, rectFill, selection]);

  const handleBack = useCallback(() => {
    if (dirty && canEditCurrentBranch) {
      const encoded = encodeGrid(gridRef.current!);
      void onSave(encoded, name, memo);
    }
    router.push(`/project/${projectId}${currentBranchQuery}`);
  }, [
    canEditCurrentBranch,
    currentBranchQuery,
    dirty,
    gridRef,
    memo,
    name,
    onSave,
    projectId,
    router,
  ]);

  const handlePlay = useCallback(() => {
    router.push(
      `/project/${projectId}/playback?start=${zentaiGamenId}${
        currentBranch.name === "main" ? "" : `&branch=${currentBranch.name}`
      }`
    );
  }, [currentBranch.name, projectId, router, zentaiGamenId]);

  const handleSaveAsTemplate = useCallback(async (templateName: string) => {
    const grid = gridRef.current!;
    const encoded = encodeGrid(grid);
    const thumbnail = generateThumbnailDataUrl(grid);
    await createTemplate(templateName, encoded, grid.width, grid.height, thumbnail);
  }, [gridRef]);

  const handleSwitchBranch = useCallback(
    (nextBranchName: string) => {
      router.push(
        `/project/${projectId}/editor/${zentaiGamenId}${branchQuery(nextBranchName)}`
      );
      router.refresh();
    },
    [projectId, router, zentaiGamenId]
  );

  const handleCreateBranch = useCallback(async () => {
    const nameInput = window.prompt("新しいブランチ名を入力してください（英数字小文字）");
    if (!nameInput) return;

    try {
      const response = await fetchJson<{ branch: ProjectBranch }>(
        `/api/projects/${projectId}/branches`,
        {
          method: "POST",
          body: JSON.stringify({
            name: nameInput,
            sourceBranchName: currentBranch.name,
          }),
        }
      );

      router.push(
        `/project/${projectId}/editor/${zentaiGamenId}${branchQuery(response.branch.name)}`
      );
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ブランチを作成できませんでした");
    }
  }, [currentBranch.name, projectId, router, zentaiGamenId]);

  const handleRequestMerge = useCallback(async () => {
    const summary = window.prompt("main への反映内容を簡単に入力してください", "");

    try {
      await fetchJson(`/api/projects/${projectId}/requests`, {
        method: "POST",
        body: JSON.stringify({
          branchName: currentBranch.name,
          summary: summary ?? "",
        }),
      });

      window.alert("main への申請を作成しました");
      router.push(`/project/${projectId}/git/requests${currentBranchQuery}`);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "申請を作成できませんでした");
    }
  }, [currentBranch.name, currentBranchQuery, projectId, router]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-card-border bg-card px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            Branch
          </span>
          <select
            value={currentBranch.name}
            onChange={(event) => handleSwitchBranch(event.target.value)}
            className="min-w-[140px] rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
          {canCreateBranches && (
            <button
              onClick={handleCreateBranch}
              className="rounded-lg border border-card-border px-3 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
            >
              ブランチ作成
            </button>
          )}
          {canRequestMerge && (
            <button
              onClick={handleRequestMerge}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity"
            >
              main へ申請
            </button>
          )}
          <button
            onClick={() => router.push(`/project/${projectId}/git/requests${currentBranchQuery}`)}
            className="relative rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            Git / リクエスト
            {unreadGitNotifications > 0 && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sky-500" />
            )}
          </button>
        </div>
        <div className="mt-2 text-xs text-muted">
          {canEditCurrentBranch
            ? "このブランチは編集できます"
            : currentBranch.is_main
              ? "main は保護中です。編集は作業ブランチで行ってください"
              : "このアカウントは閲覧専用です"}
        </div>
        {actionError && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {actionError}
          </div>
        )}
      </div>

      <EditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBack={handleBack}
        onPlay={handlePlay}
        saveStatus={dirty && saveStatus === "saved" ? "unsaved" : saveStatus}
        name={name}
        onNameChange={setName}
        hasSelection={selection !== null}
        onFillSelection={handleFillSelection}
        onClearSelection={() => setSelection(null)}
        onSaveAsTemplate={() => setShowTemplateSave(true)}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing((prev) => (canEditCurrentBranch ? !prev : prev))}
        onExport={() => void onExport()}
        onToggleMemo={() => setShowMemo((prev) => !prev)}
        showMemo={showMemo}
        canEdit={canEditCurrentBranch}
      />

      {showMemo && (
        <div className="px-3 py-2 bg-card border-b border-card-border">
          <label className="text-xs text-muted mb-1 block">動き指示メモ</label>
          <input
            type="text"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="例: 笛でとじる、ウェーブ、長め..."
            className="w-full px-2 py-1.5 bg-background border border-card-border rounded text-sm text-foreground focus:outline-none focus:border-accent"
          />
        </div>
      )}

      <GridCanvas
        gridRef={gridRef as React.RefObject<GridData>}
        revision={revision}
        viewport={viewport}
        activeTool={activeTool}
        activeColor={activeColor}
        selection={selection}
        onStartBatchPaint={startBatchPaint}
        onBatchPaintCell={batchPaintCell}
        onFloodFill={floodFill}
        onSelectionChange={setSelection}
        onViewportChange={setViewport}
        isEditing={isEditing && canEditCurrentBranch}
      />

      {isEditing && canEditCurrentBranch && (
        <ColorPalette activeColor={activeColor} onColorChange={setActiveColor} />
      )}

      {showTemplateSave && canEditCurrentBranch && (
        <TemplateSaveDialog
          onSave={handleSaveAsTemplate}
          onClose={() => setShowTemplateSave(false)}
        />
      )}
    </div>
  );
}
