"use client";

import type { Tool } from "./useGridState";

interface EditorToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onPlay: () => void;
  showPlayButton: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  name: string;
  onNameChange: (name: string) => void;
  hasSelection: boolean;
  onFillSelection: () => void;
  onClearSelection: () => void;
  onSaveAsTemplate: () => void;
  isEditing: boolean;
  onToggleEdit: () => void;
  onExport: () => void;
  isExporting: boolean;
  exportLabel: string;
  onToggleMemo: () => void;
  showMemo: boolean;
  isMoveMode: boolean;
  onToggleMove: () => void;
  hasMoveSelection: boolean;
  onClearMoveSelection: () => void;
  isMoveSelecting: boolean;
  onToggleMoveSelecting: () => void;
  isKeepMode?: boolean;
  isKeepSelecting?: boolean;
  hasKeepSelection?: boolean;
  onToggleKeepSelecting?: () => void;
  onClearKeepSelection?: () => void;
  canEdit: boolean;
}

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "paint", label: "ペイント", icon: "✏️" },
  { id: "eraser", label: "消しゴム", icon: "🧹" },
  { id: "bucket", label: "バケツ", icon: "🪣" },
  { id: "select", label: "範囲選択", icon: "⬜" },
];

export default function EditorToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBack,
  onPlay,
  showPlayButton,
  saveStatus,
  name,
  onNameChange,
  hasSelection,
  onFillSelection,
  onClearSelection,
  onSaveAsTemplate,
  isEditing,
  onToggleEdit,
  onExport,
  isExporting,
  exportLabel,
  onToggleMemo,
  isMoveMode,
  onToggleMove,
  hasMoveSelection,
  onClearMoveSelection,
  isMoveSelecting,
  onToggleMoveSelecting,
  isKeepMode = false,
  isKeepSelecting = true,
  hasKeepSelection = false,
  onToggleKeepSelecting,
  onClearKeepSelection,
  showMemo,
  canEdit,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-col bg-card border-b border-card-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onBack}
          className="text-muted hover:text-foreground transition-colors px-2 py-1 text-lg"
          aria-label="戻る"
        >
          ←
        </button>

        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          readOnly={!canEdit}
          className="flex-1 bg-transparent text-foreground font-medium px-2 py-1 border-b border-transparent hover:border-card-border focus:border-accent focus:outline-none transition-colors min-w-0 read-only:cursor-default read-only:opacity-80"
        />

        <button
          onClick={onExport}
          disabled={isExporting}
          aria-busy={isExporting}
          className="min-w-[104px] px-3 py-1 text-center text-sm text-muted hover:text-foreground transition-colors shrink-0 disabled:cursor-wait disabled:opacity-60"
        >
          {exportLabel}
        </button>

        <button
          onClick={onToggleMemo}
          className={`px-3 py-1 text-sm rounded-lg transition-colors shrink-0 ${
            showMemo
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          メモ
        </button>

        {isKeepMode ? (
          <>
            <button
              onClick={onToggleKeepSelecting}
              disabled={!canEdit}
              className={`px-3 py-1 text-sm rounded-lg transition-colors shrink-0 disabled:opacity-40 ${
                isKeepSelecting
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              keep選択
            </button>
            {(hasKeepSelection || !isKeepSelecting) && (
              <button
                onClick={onToggleKeepSelecting}
                disabled={!canEdit}
                className={`px-2 py-1 text-[10px] rounded transition-colors shrink-0 disabled:opacity-40 ${
                  isKeepSelecting
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {isKeepSelecting ? "選択確定" : "再選択"}
              </button>
            )}
            {hasKeepSelection && (
              <button
                onClick={onClearKeepSelection}
                disabled={!canEdit}
                className="px-2 py-1 text-[10px] text-muted hover:text-foreground transition-colors shrink-0 disabled:opacity-40"
              >
                選択解除
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={onToggleMove}
              disabled={!canEdit}
              className={`px-3 py-1 text-sm rounded-lg transition-colors shrink-0 disabled:opacity-40 ${
                isMoveMode
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              移動
            </button>

            {isMoveMode && (
              <>
                {(hasMoveSelection || !isMoveSelecting) && (
                  <button
                    onClick={onToggleMoveSelecting}
                    disabled={!canEdit}
                    className={`px-2 py-1 text-[10px] rounded transition-colors shrink-0 disabled:opacity-40 ${
                      isMoveSelecting
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {isMoveSelecting ? "選択確定" : "再選択"}
                  </button>
                )}
                <button
                  onClick={onUndo}
                  disabled={!canEdit || !canUndo}
                  className="px-2 py-1 text-[10px] text-muted hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
                >
                  ↩ 戻す
                </button>
                {hasMoveSelection && (
                  <button
                    onClick={onClearMoveSelection}
                    disabled={!canEdit}
                    className="px-2 py-1 text-[10px] text-muted hover:text-foreground transition-colors shrink-0 disabled:opacity-40"
                  >
                    選択解除
                  </button>
                )}
              </>
            )}
          </>
        )}

        {!isKeepMode && (
          <button
            onClick={onToggleEdit}
            disabled={!canEdit}
            className={`px-3 py-1 text-sm rounded-lg transition-colors shrink-0 disabled:opacity-40 ${
              isEditing
                ? "bg-accent/20 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            編集
          </button>
        )}

        <span className="text-xs text-muted shrink-0">
          {saveStatus === "saving"
            ? "保存中..."
            : saveStatus === "saved"
              ? "保存済み"
              : "未保存"}
        </span>

        {showPlayButton && (
          <button
            onClick={onPlay}
            className="text-accent hover:opacity-80 transition-opacity px-2 py-1 text-lg"
            aria-label="再生"
          >
            ▶
          </button>
        )}
      </div>

      {isEditing && !isKeepMode && canEdit && (
        <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0 ${
                activeTool === tool.id
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <span>{tool.icon}</span>
              <span>{tool.label}</span>
            </button>
          ))}

          <div className="w-px h-5 bg-card-border mx-1 shrink-0" />

          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="px-2 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
          >
            ↩ 戻す
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="px-2 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-30 transition-colors shrink-0"
          >
            ↪ やり直し
          </button>

          <div className="w-px h-5 bg-card-border mx-1 shrink-0" />

          <button
            onClick={onSaveAsTemplate}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors shrink-0"
          >
            テンプレ保存
          </button>

          {hasSelection && (
            <>
              <div className="w-px h-5 bg-card-border mx-1 shrink-0" />
              <button
                onClick={onFillSelection}
                className="px-3 py-1.5 text-sm bg-accent/20 text-accent rounded-lg shrink-0"
              >
                選択範囲を塗る
              </button>
              <button
                onClick={onClearSelection}
                className="px-2 py-1.5 text-sm text-muted hover:text-foreground shrink-0"
              >
                選択解除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
