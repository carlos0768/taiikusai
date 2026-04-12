"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ColorIndex,
  type GridData,
  createEmptyGrid,
} from "@/lib/grid/types";
import { encodeGrid } from "@/lib/grid/codec";
import { useGridState, type Tool } from "./useGridState";
import GridCanvas from "./GridCanvas";
import ColorPalette from "./ColorPalette";
import EditorToolbar from "./EditorToolbar";
import WavePreviewOverlay from "./WavePreviewOverlay";
import type { Viewport } from "./gridRenderer";
import TemplateSaveDialog from "@/components/templates/TemplateSaveDialog";
import { createTemplate } from "@/lib/api/templates";
import { generateThumbnailDataUrl } from "@/lib/grid/thumbnail";
import type { MotionType, PanelType, WaveMotionData } from "@/types";

export interface GridEditorSavePayload {
  gridData: string;
  name: string;
  memo: string;
  /** undefined: 変更なし。null: クリア。WaveMotionData: 上書き */
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
  initialName: string;
  initialMemo: string;
  onSave: (payload: GridEditorSavePayload) => Promise<void>;
  onExport: () => void;
}

export default function GridEditor({
  initialGrid,
  initialAfterGrid,
  panelType,
  motionType,
  initialMotionData,
  projectId,
  initialName,
  initialMemo,
  onSave,
  onExport,
}: GridEditorProps) {
  const isMotion = panelType === "motion";
  const isWave = isMotion && motionType === "wave";

  // before / after の編集状態を独立に持つ
  const beforeState = useGridState(initialGrid);
  const afterState = useGridState(
    initialAfterGrid ??
      createEmptyGrid(initialGrid.width, initialGrid.height)
  );

  const [activeTab, setActiveTab] = useState<"before" | "after">("before");
  const activeState = isWave && activeTab === "after" ? afterState : beforeState;

  // ウェーブ設定 (motion_data 用)
  const [motionData, setMotionData] = useState<WaveMotionData | null>(
    initialMotionData
  );
  const [motionDataRevision, setMotionDataRevision] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [moveSelectedCells, setMoveSelectedCells] = useState<Set<string>>(new Set());
  const [moveDragOffset, setMoveDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [isMoveSelecting, setIsMoveSelecting] = useState(true);
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // タブ切り替えで選択範囲・移動選択をクリア
  useEffect(() => {
    setSelection(null);
    setMoveSelectedCells(new Set());
  }, [activeTab]);

  // 編集時の dirty 検知 (before / after / motionData)
  const dirty =
    beforeState.dirty || (isWave && afterState.dirty) || motionDataRevision > 0;
  const combinedRevision =
    beforeState.revision + (isWave ? afterState.revision : 0) + motionDataRevision;

  const buildPayload = useCallback((): GridEditorSavePayload => {
    const payload: GridEditorSavePayload = {
      gridData: encodeGrid(beforeState.gridRef.current!),
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
  }, [beforeState, afterState, name, memo, isWave, motionData]);

  // Auto-save with 2-second debounce
  useEffect(() => {
    if (!dirty) return;
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
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [combinedRevision, dirty, buildPayload, onSave, beforeState, afterState]);

  // Save name/memo changes
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await onSave(buildPayload());
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, memo]);

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
  }, [selection, activeColor, activeState]);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const handleBack = useCallback(() => {
    if (dirty) {
      onSave(buildPayload());
    }
    router.push(`/project/${projectId}`);
  }, [dirty, buildPayload, onSave, projectId, router]);

  // Play: モーションパネルなら preview を出す。一般パネルでは何もしない (ボタン非表示)
  const handlePlay = useCallback(() => {
    if (!isWave) return;
    setShowWavePreview(true);
  }, [isWave]);

  const handleSaveAsTemplate = useCallback(
    async (templateName: string) => {
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
    [activeState]
  );

  // ウェーブ設定の更新
  const updateWaveSetting = useCallback(
    (patch: Partial<Omit<WaveMotionData, "after_grid_data">>) => {
      setMotionData((prev) => {
        if (!prev) return prev;
        return { ...prev, ...patch };
      });
      setMotionDataRevision((r) => r + 1);
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
  }, [isWave, motionData, beforeState, afterState, showWavePreview]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col">
      <EditorToolbar
        activeTool={isMoveMode ? "move" : activeTool}
        onToolChange={setActiveTool}
        onUndo={activeState.undo}
        onRedo={activeState.redo}
        canUndo={true}
        canRedo={true}
        onBack={handleBack}
        onPlay={handlePlay}
        showPlayButton={isMotion}
        saveStatus={saveStatus}
        name={name}
        onNameChange={setName}
        hasSelection={selection !== null}
        onFillSelection={handleFillSelection}
        onClearSelection={handleClearSelection}
        onSaveAsTemplate={() => setShowTemplateSave(true)}
        isEditing={isEditing}
        onToggleEdit={() => { setIsEditing(!isEditing); if (isMoveMode) setIsMoveMode(false); }}
        onExport={onExport}
        onToggleMemo={() => setShowMemo(!showMemo)}
        showMemo={showMemo}
        isMoveMode={isMoveMode}
        onToggleMove={() => { setIsMoveMode(!isMoveMode); setMoveSelectedCells(new Set()); setIsMoveSelecting(true); if (isEditing) setIsEditing(false); }}
        hasMoveSelection={moveSelectedCells.size > 0}
        onClearMoveSelection={() => { setMoveSelectedCells(new Set()); setIsMoveSelecting(true); }}
        isMoveSelecting={isMoveSelecting}
        onToggleMoveSelecting={() => setIsMoveSelecting(!isMoveSelecting)}
      />

      {/* Wave: before/after タブ + 設定 */}
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
              value={motionData.speed_columns_per_sec}
              onChange={(e) =>
                updateWaveSetting({
                  speed_columns_per_sec: Math.max(
                    0.5,
                    Number(e.target.value) || 0.5
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center"
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
              value={(motionData.before_duration_ms / 1000).toFixed(1)}
              onChange={(e) =>
                updateWaveSetting({
                  before_duration_ms: Math.max(
                    0,
                    Math.round(Number(e.target.value) * 1000)
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center"
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
              value={(motionData.after_duration_ms / 1000).toFixed(1)}
              onChange={(e) =>
                updateWaveSetting({
                  after_duration_ms: Math.max(
                    0,
                    Math.round(Number(e.target.value) * 1000)
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 bg-background border border-card-border rounded text-foreground text-center"
            />
            秒
          </label>
        </div>
      )}

      {/* Memo input */}
      {showMemo && (
        <div className="px-3 py-2 bg-card border-b border-card-border">
          <label className="text-xs text-muted mb-1 block">動き指示メモ</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: 笛でとじる、ウェーブ、長め..."
            className="w-full px-2 py-1.5 bg-background border border-card-border rounded text-sm text-foreground focus:outline-none focus:border-accent"
          />
        </div>
      )}

      <GridCanvas
        gridRef={activeState.gridRef as React.RefObject<GridData>}
        revision={activeState.revision}
        viewport={viewport}
        activeTool={isMoveMode ? "move" : activeTool}
        activeColor={activeColor}
        selection={selection}
        onPaintCell={activeState.paintCell}
        onStartBatchPaint={activeState.startBatchPaint}
        onBatchPaintCell={activeState.batchPaintCell}
        onFloodFill={activeState.floodFill}
        onSelectionChange={setSelection}
        onViewportChange={setViewport}
        isEditing={isEditing}
        onMoveSelection={activeState.moveSelection}
        moveSelectedCells={moveSelectedCells}
        onMoveSelectedCellsChange={setMoveSelectedCells}
        moveDragOffset={moveDragOffset}
        onMoveDragOffsetChange={setMoveDragOffset}
        isMoveSelecting={isMoveSelecting}
      />

      {isEditing && (
        <ColorPalette activeColor={activeColor} onColorChange={setActiveColor} />
      )}

      {showTemplateSave && (
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
