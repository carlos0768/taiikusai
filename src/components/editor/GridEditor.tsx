"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColorIndex, GridData } from "@/lib/grid/types";
import { encodeGrid } from "@/lib/grid/codec";
import { useGridState, type Tool } from "./useGridState";
import GridCanvas from "./GridCanvas";
import ColorPalette from "./ColorPalette";
import EditorToolbar from "./EditorToolbar";
import type { Viewport } from "./gridRenderer";
import TemplateSaveDialog from "@/components/templates/TemplateSaveDialog";
import { createTemplate } from "@/lib/api/templates";
import { generateThumbnailDataUrl } from "@/lib/grid/thumbnail";

interface GridEditorProps {
  initialGrid: GridData;
  zentaiGamenId: string;
  projectId: string;
  initialName: string;
  onSave: (gridData: string, name: string, thumbnail?: string) => Promise<void>;
}

export default function GridEditor({
  initialGrid,
  zentaiGamenId,
  projectId,
  initialName,
  onSave,
}: GridEditorProps) {
  const {
    gridRef,
    revision,
    dirty,
    paintCell,
    startBatchPaint,
    batchPaintCell,
    floodFill,
    rectFill,
    undo,
    redo,
    clearDirty,
  } = useGridState(initialGrid);

  const [isEditing, setIsEditing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("paint");
  const [activeColor, setActiveColor] = useState<ColorIndex>(1); // yellow default
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

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
        const encoded = encodeGrid(gridRef.current!);
        await onSave(encoded, name);
        clearDirty();
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [revision, dirty, name, onSave, gridRef, clearDirty]);

  // Save name changes
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const encoded = encodeGrid(gridRef.current!);
        await onSave(encoded, name);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [name]);

  const handleFillSelection = useCallback(() => {
    if (!selection) return;
    rectFill(selection.x1, selection.y1, selection.x2, selection.y2, activeColor);
    setSelection(null);
  }, [selection, activeColor, rectFill]);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const handleBack = useCallback(() => {
    // Save before navigating away
    if (dirty) {
      const encoded = encodeGrid(gridRef.current!);
      onSave(encoded, name);
    }
    router.push(`/project/${projectId}`);
  }, [dirty, gridRef, name, onSave, projectId, router]);

  const handlePlay = useCallback(() => {
    router.push(`/project/${projectId}/playback?start=${zentaiGamenId}`);
  }, [projectId, zentaiGamenId, router]);

  const handleSaveAsTemplate = useCallback(
    async (templateName: string) => {
      const grid = gridRef.current!;
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
    [gridRef]
  );

  return (
    <div className="h-full flex flex-col">
      <EditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onUndo={undo}
        onRedo={redo}
        canUndo={true}
        canRedo={true}
        onBack={handleBack}
        onPlay={handlePlay}
        saveStatus={saveStatus}
        name={name}
        onNameChange={setName}
        hasSelection={selection !== null}
        onFillSelection={handleFillSelection}
        onClearSelection={handleClearSelection}
        onSaveAsTemplate={() => setShowTemplateSave(true)}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
      />

      <GridCanvas
        gridRef={gridRef as React.RefObject<GridData>}
        revision={revision}
        viewport={viewport}
        activeTool={activeTool}
        activeColor={activeColor}
        selection={selection}
        onPaintCell={paintCell}
        onStartBatchPaint={startBatchPaint}
        onBatchPaintCell={batchPaintCell}
        onFloodFill={floodFill}
        onSelectionChange={setSelection}
        onViewportChange={setViewport}
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
    </div>
  );
}
