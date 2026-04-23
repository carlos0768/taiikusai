"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";
import {
  type ColorIndex,
  type GridData,
  createEmptyGrid,
  createFilledGrid,
} from "@/lib/grid/types";
import { encodeGrid } from "@/lib/grid/codec";
import {
  buildKeepMaskFromSelectedCells,
  getKeepSelectedCells,
} from "@/lib/keep";
import { useGridState, type Tool } from "./useGridState";
import GridCanvas from "./GridCanvas";
import ColorPalette from "./ColorPalette";
import EditorToolbar from "./EditorToolbar";
import WavePreviewOverlay from "./WavePreviewOverlay";
import type { Viewport } from "./gridRenderer";
import TemplateSaveDialog from "@/components/templates/TemplateSaveDialog";
import { createTemplate } from "@/lib/api/templates";
import { generateThumbnailDataUrl } from "@/lib/grid/thumbnail";
import type {
  AuthProfile,
  MotionType,
  PanelType,
  ProjectBranch,
  WaveMotionData,
} from "@/types";

export interface GridEditorSavePayload {
  gridData: string;
  name: string;
  memo: string;
  motionData?: WaveMotionData | null;
}

interface GridEditorProps {
  initialGrid: GridData;
  initialAfterGrid: GridData | null;
  panelType: PanelType;
  motionType: MotionType | null;
  initialMotionData: WaveMotionData | null;
  zentaiGamenId: string;
  projectId: string;
  branchId: string;
  initialName: string;
  initialMemo: string;
  onSave: (payload: GridEditorSavePayload) => Promise<void>;
  onExport: () => void;
  auth: AuthProfile;
  currentBranch: ProjectBranch;
  branches: ProjectBranch[];
  unreadGitNotifications: number;
  canEditCurrentBranch: boolean;
  canCreateBranches: boolean;
  canRequestMerge: boolean;
}

export default function GridEditor({
  initialGrid,
  initialAfterGrid,
  panelType,
  motionType,
  initialMotionData,
  zentaiGamenId,
  projectId,
  branchId,
  initialName,
  initialMemo,
  onSave,
  onExport,
  auth,
  currentBranch,
  branches,
  unreadGitNotifications,
  canEditCurrentBranch,
  canCreateBranches,
  canRequestMerge,
}: GridEditorProps) {
  const isMotion = panelType === "motion";
  const isWave = isMotion && motionType === "wave";
  const isKeep = panelType === "keep";
  const canViewGit =
    auth.is_admin ||
    auth.permissions.can_view_git_requests ||
    auth.permissions.can_request_main_merge ||
    auth.permissions.can_create_branches;

  const keepCanvasGrid = useMemo(
    () => createFilledGrid(initialGrid.width, initialGrid.height, 0),
    [initialGrid.height, initialGrid.width]
  );

  const beforeState = useGridState(isKeep ? keepCanvasGrid : initialGrid);
  const afterState = useGridState(
    initialAfterGrid ??
      createEmptyGrid(initialGrid.width, initialGrid.height)
  );

  const [activeTab, setActiveTab] = useState<"before" | "after">("before");
  const activeState = isWave && activeTab === "after" ? afterState : beforeState;

  const [motionData, setMotionData] = useState<WaveMotionData | null>(
    initialMotionData
  );
  const [motionDataRevision, setMotionDataRevision] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [moveSelectedCells, setMoveSelectedCells] = useState<Set<string>>(new Set());
  const [moveDragOffset, setMoveDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [isMoveSelecting, setIsMoveSelecting] = useState(true);
  const [keepSelectedCells, setKeepSelectedCells] = useState<Set<string>>(
    () => (isKeep ? getKeepSelectedCells(initialGrid) : new Set())
  );
  const [isKeepSelecting, setIsKeepSelecting] = useState(true);
  const [keepRevision, setKeepRevision] = useState(0);
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
  const [showWavePreview, setShowWavePreview] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    prefetchRoutes(router, [
      buildBranchPath(`/project/${projectId}`, branchId),
      buildBranchPath(`/project/${projectId}/git/requests`, currentBranch.id),
      ...branches.map((branch) =>
        buildBranchPath(
          `/project/${projectId}/editor/${zentaiGamenId}`,
          branch.id
        )
      ),
    ]);
  }, [
    branchId,
    branches,
    currentBranch.id,
    projectId,
    router,
    zentaiGamenId,
  ]);

  useEffect(() => {
    setSelection(null);
    setMoveSelectedCells(new Set());
  }, [activeTab]);

  const dirty =
    beforeState.dirty ||
    (isWave && afterState.dirty) ||
    motionDataRevision > 0 ||
    keepRevision > 0;
  const combinedRevision =
    beforeState.revision +
    (isWave ? afterState.revision : 0) +
    motionDataRevision +
    keepRevision;

  const buildPayload = useCallback((): GridEditorSavePayload => {
    const payload: GridEditorSavePayload = {
      gridData: encodeGrid(
        isKeep
          ? buildKeepMaskFromSelectedCells(
              initialGrid.width,
              initialGrid.height,
              keepSelectedCells
            )
          : beforeState.gridRef.current!
      ),
      name,
      memo,
    };

    if (isWave && motionData) {
      payload.motionData = {
        ...motionData,
        after_grid_data: encodeGrid(afterState.gridRef.current!),
      };
    }

    return payload;
  }, [
    afterState,
    beforeState,
    initialGrid.height,
    initialGrid.width,
    isKeep,
    isWave,
    keepSelectedCells,
    memo,
    motionData,
    name,
  ]);

  useEffect(() => {
    if (!canEditCurrentBranch || !dirty) return;
    setSaveStatus("unsaved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await onSave(buildPayload());
        beforeState.clearDirty();
        afterState.clearDirty();
        setMotionDataRevision(0);
        setKeepRevision(0);
        setActionError(null);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("unsaved");
        setActionError(
          error instanceof Error ? error.message : "保存に失敗しました"
        );
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    afterState,
    beforeState,
    buildPayload,
    canEditCurrentBranch,
    combinedRevision,
    dirty,
    onSave,
  ]);

  useEffect(() => {
    if (!canEditCurrentBranch) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await onSave(buildPayload());
        setActionError(null);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("unsaved");
        setActionError(
          error instanceof Error ? error.message : "保存に失敗しました"
        );
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, memo, canEditCurrentBranch]);

  const handleFillSelection = useCallback(() => {
    if (!selection) return;
    activeState.rectFill(
      selection.x1,
      selection.y1,
      selection.x2,
      selection.y2,
      activeColor
    );
    setSelection(null);
  }, [activeColor, activeState, selection]);

  const handleBack = useCallback(() => {
    if (dirty && canEditCurrentBranch) {
      void onSave(buildPayload());
    }
    router.push(buildBranchPath(`/project/${projectId}`, branchId));
  }, [branchId, buildPayload, canEditCurrentBranch, dirty, onSave, projectId, router]);

  const handlePlay = useCallback(() => {
    if (!isWave) return;
    setShowWavePreview(true);
  }, [isWave]);

  const handleSaveAsTemplate = useCallback(
    async (templateName: string) => {
      if (isKeep) return;
      const grid = activeState.gridRef.current!;
      const encoded = encodeGrid(grid);
      const thumbnail = generateThumbnailDataUrl(grid);
      await createTemplate(
        templateName,
        encoded,
        grid.width,
        grid.height,
        thumbnail
      );
    },
    [activeState, isKeep]
  );

  const handleSwitchBranch = useCallback(
    (nextBranchId: string) => {
      router.push(
        buildBranchPath(
          `/project/${projectId}/editor/${zentaiGamenId}`,
          nextBranchId
        )
      );
    },
    [projectId, router, zentaiGamenId]
  );

  const handleCreateBranch = useCallback(async () => {
    const nameInput = prompt("新しいブランチ名を入力してください");
    if (!nameInput) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput,
          sourceBranchId: currentBranch.id,
        }),
      });
      const result = (await response.json()) as
        | { branch: ProjectBranch }
        | { error?: string };

      if (!response.ok || !("branch" in result)) {
        throw new Error(
          "error" in result ? result.error : "ブランチを作成できませんでした"
        );
      }

      setActionError(null);
      router.push(
        buildBranchPath(
          `/project/${projectId}/editor/${zentaiGamenId}`,
          result.branch.id
        )
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "ブランチを作成できませんでした"
      );
    }
  }, [currentBranch.id, projectId, router, zentaiGamenId]);

  const handleRequestMerge = useCallback(async () => {
    const summary = prompt("main への反映内容を簡単に入力してください", "");

    try {
      const response = await fetch(`/api/projects/${projectId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: currentBranch.id,
          summary: summary ?? "",
        }),
      });
      const result = (await response.json()) as
        | { request: { id: string } }
        | { error?: string };

      if (!response.ok || !("request" in result)) {
        throw new Error(
          "error" in result ? result.error : "申請を作成できませんでした"
        );
      }

      setActionError(null);
      alert("main への申請を作成しました");
      router.push(buildBranchPath(`/project/${projectId}/git/requests`, currentBranch.id));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "申請を作成できませんでした"
      );
    }
  }, [currentBranch.id, projectId, router]);

  const updateWaveSetting = useCallback(
    (patch: Partial<Omit<WaveMotionData, "after_grid_data">>) => {
      setMotionData((prev) => {
        if (!prev) return prev;
        return { ...prev, ...patch };
      });
      setMotionDataRevision((revision) => revision + 1);
    },
    []
  );

  const wavePreviewProps = useMemo(() => {
    if (!isWave || !motionData) return null;
    return {
      before: beforeState.gridRef.current!,
      after: afterState.gridRef.current!,
      beforeMs: motionData.before_duration_ms,
      afterMs: motionData.after_duration_ms,
      speedColPerSec: motionData.speed_columns_per_sec,
    };
  }, [afterState, beforeState, isWave, motionData]);

  const handleKeepSelectionChange = useCallback((cells: Set<string>) => {
    setKeepSelectedCells(cells);
    setKeepRevision((revision) => revision + 1);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-card-border bg-card px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            Branch
          </span>
          <select
            value={currentBranch.id}
            onChange={(event) => handleSwitchBranch(event.target.value)}
            className="min-w-[160px] rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {canCreateBranches && (
            <button
              onClick={() => void handleCreateBranch()}
              className="rounded-lg border border-card-border px-3 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
            >
              ブランチ作成
            </button>
          )}
          {!auth.is_admin && canRequestMerge && (
            <button
              onClick={() => void handleRequestMerge()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity"
            >
              main へ申請
            </button>
          )}
          {canViewGit && (
            <button
              onClick={() =>
                router.push(
                  buildBranchPath(`/project/${projectId}/git/requests`, currentBranch.id)
                )
              }
              className="relative rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              Git / リクエスト
              {unreadGitNotifications > 0 && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sky-500" />
              )}
            </button>
          )}
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
        activeTool={isKeep || isMoveMode ? "move" : activeTool}
        onToolChange={setActiveTool}
        onUndo={activeState.undo}
        onRedo={activeState.redo}
        canUndo={true}
        canRedo={true}
        onBack={handleBack}
        onPlay={handlePlay}
        showPlayButton={isMotion}
        saveStatus={dirty && saveStatus === "saved" ? "unsaved" : saveStatus}
        name={name}
        onNameChange={setName}
        hasSelection={selection !== null}
        onFillSelection={handleFillSelection}
        onClearSelection={() => setSelection(null)}
        onSaveAsTemplate={() => setShowTemplateSave(true)}
        isEditing={isKeep ? false : isEditing}
        onToggleEdit={() => {
          if (!canEditCurrentBranch) return;
          setIsEditing((prev) => !prev);
          if (isMoveMode) setIsMoveMode(false);
        }}
        onExport={onExport}
        onToggleMemo={() => setShowMemo((prev) => !prev)}
        showMemo={showMemo}
        isMoveMode={isKeep ? false : isMoveMode}
        onToggleMove={() => {
          if (!canEditCurrentBranch) return;
          setIsMoveMode((prev) => !prev);
          setMoveSelectedCells(new Set());
          setIsMoveSelecting(true);
          if (isEditing) setIsEditing(false);
        }}
        hasMoveSelection={moveSelectedCells.size > 0}
        onClearMoveSelection={() => {
          setMoveSelectedCells(new Set());
          setIsMoveSelecting(true);
        }}
        isMoveSelecting={isMoveSelecting}
        onToggleMoveSelecting={() => setIsMoveSelecting((prev) => !prev)}
        isKeepMode={isKeep}
        isKeepSelecting={isKeepSelecting}
        hasKeepSelection={keepSelectedCells.size > 0}
        onToggleKeepSelecting={() => canEditCurrentBranch && setIsKeepSelecting((prev) => !prev)}
        onClearKeepSelection={() => {
          setKeepSelectedCells(new Set());
          setIsKeepSelecting(true);
          setKeepRevision((revision) => revision + 1);
        }}
        canEdit={canEditCurrentBranch}
      />

      {isWave && motionData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-card-border overflow-x-auto">
          <div className="flex shrink-0 rounded-lg overflow-hidden border border-card-border">
            <button
              onClick={() => setActiveTab("before")}
              className={`px-3 py-1 text-xs transition-colors ${
                activeTab === "before"
                  ? "bg-accent text-black"
                  : "bg-card text-muted hover:text-foreground"
              }`}
            >
              ウェーブ前
            </button>
            <button
              onClick={() => setActiveTab("after")}
              className={`px-3 py-1 text-xs transition-colors ${
                activeTab === "after"
                  ? "bg-accent text-black"
                  : "bg-card text-muted hover:text-foreground"
              }`}
            >
              ウェーブ後
            </button>
          </div>

          <div className="w-px h-5 bg-card-border shrink-0" />

          <label className="flex items-center gap-1 text-xs text-muted shrink-0">
            速度
            <input
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              disabled={!canEditCurrentBranch}
              value={motionData.speed_columns_per_sec}
              onChange={(event) =>
                updateWaveSetting({
                  speed_columns_per_sec: Math.max(
                    0.5,
                    Number(event.target.value) || 0.5
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center disabled:opacity-60"
            />
            列/秒
          </label>

          <label className="flex items-center gap-1 text-xs text-muted shrink-0">
            ウェーブ前表示
            <input
              type="number"
              min={0}
              max={20}
              step={0.1}
              disabled={!canEditCurrentBranch}
              value={(motionData.before_duration_ms / 1000).toFixed(1)}
              onChange={(event) =>
                updateWaveSetting({
                  before_duration_ms: Math.max(
                    0,
                    Math.round(Number(event.target.value) * 1000)
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center disabled:opacity-60"
            />
            秒
          </label>

          <label className="flex items-center gap-1 text-xs text-muted shrink-0">
            ウェーブ後表示
            <input
              type="number"
              min={0}
              max={20}
              step={0.1}
              disabled={!canEditCurrentBranch}
              value={(motionData.after_duration_ms / 1000).toFixed(1)}
              onChange={(event) =>
                updateWaveSetting({
                  after_duration_ms: Math.max(
                    0,
                    Math.round(Number(event.target.value) * 1000)
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center disabled:opacity-60"
            />
            秒
          </label>
        </div>
      )}

      {showMemo && (
        <div className="px-3 py-2 bg-card border-b border-card-border">
          <label className="text-xs text-muted mb-1 block">動き指示メモ</label>
          <input
            type="text"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            readOnly={!canEditCurrentBranch}
            placeholder="例: 笛でとじる、ウェーブ、長め..."
            className="w-full px-2 py-1.5 bg-background border border-card-border rounded text-sm text-foreground focus:outline-none focus:border-accent read-only:cursor-default read-only:opacity-80"
          />
        </div>
      )}

      <GridCanvas
        gridRef={activeState.gridRef as React.RefObject<GridData>}
        revision={activeState.revision + (isKeep ? keepRevision : 0)}
        viewport={viewport}
        activeTool={isKeep || isMoveMode ? "move" : activeTool}
        activeColor={activeColor}
        selection={selection}
        onStartBatchPaint={activeState.startBatchPaint}
        onBatchPaintCell={activeState.batchPaintCell}
        onFloodFill={activeState.floodFill}
        onSelectionChange={setSelection}
        onViewportChange={setViewport}
        isEditing={canEditCurrentBranch && (isKeep ? false : isEditing)}
        onMoveSelection={isKeep ? () => {} : activeState.moveSelection}
        moveSelectedCells={isKeep ? keepSelectedCells : moveSelectedCells}
        onMoveSelectedCellsChange={
          isKeep ? handleKeepSelectionChange : setMoveSelectedCells
        }
        moveDragOffset={isKeep ? null : moveDragOffset}
        onMoveDragOffsetChange={isKeep ? () => {} : setMoveDragOffset}
        isMoveSelecting={isKeep ? isKeepSelecting : isMoveSelecting}
        disableMoveDrag={isKeep || !canEditCurrentBranch}
      />

      {isEditing && !isKeep && canEditCurrentBranch && (
        <ColorPalette activeColor={activeColor} onColorChange={setActiveColor} />
      )}

      {showTemplateSave && !isKeep && canEditCurrentBranch && (
        <TemplateSaveDialog
          onSave={handleSaveAsTemplate}
          onClose={() => setShowTemplateSave(false)}
        />
      )}

      {showWavePreview && wavePreviewProps && (
        <WavePreviewOverlay
          {...wavePreviewProps}
          onClose={() => setShowWavePreview(false)}
        />
      )}
    </div>
  );
}
