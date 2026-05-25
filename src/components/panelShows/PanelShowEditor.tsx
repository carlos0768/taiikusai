"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { READONLY_AUTH_PROFILE } from "@/lib/client/authProfile";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import { getPanelShow, updatePanelShow } from "@/lib/api/panelShows";
import type {
  AuthProfile,
  PanelShow,
  PanelShowPlacement,
  ProjectBranch,
  ZentaiGamen,
} from "@/types";
import PanelCanvas from "./PanelCanvas";

interface PanelShowEditorProps {
  showId: string;
  projectId: string;
  branchId: string;
}

interface MeResponse {
  profile: AuthProfile;
}

const MIN_DIM = 1;
const MAX_DIM = 20;

type Cell = { row: number; col: number } | null;

function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

function applyPlacement(
  placements: PanelShowPlacement[],
  panelId: string,
  target: Cell,
  origin: Cell
): PanelShowPlacement[] {
  let next = placements.filter((p) => p.panel_id !== panelId);

  if (target) {
    const occupant = next.find(
      (p) => p.row === target.row && p.col === target.col
    );
    if (occupant) {
      next = next.filter((p) => p !== occupant);
      if (origin) {
        next.push({
          panel_id: occupant.panel_id,
          row: origin.row,
          col: origin.col,
        });
      }
    }
    next.push({ panel_id: panelId, row: target.row, col: target.col });
  }

  return next;
}

function computeCanEdit(
  auth: AuthProfile,
  branch: ProjectBranch | null
): boolean {
  if (!branch) return false;
  if (auth.is_admin) return true;
  if (branch.is_main) return false;
  return (
    (auth.permissions.can_edit_branch_content ||
      auth.permissions.can_create_branches) &&
    branch.created_by === auth.id
  );
}

export default function PanelShowEditor({
  showId,
  projectId,
  branchId,
}: PanelShowEditorProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(1);
  const [gridHeight, setGridHeight] = useState(1);
  const [panelMap, setPanelMap] = useState<Map<string, ZentaiGamen>>(
    () => new Map()
  );
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [hasMissingPanels, setHasMissingPanels] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(1);
  const [placements, setPlacements] = useState<PanelShowPlacement[]>([]);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [drag, setDrag] = useState<{
    panelId: string;
    x: number;
    y: number;
  } | null>(null);

  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [show, context, meResult] = await Promise.all([
          getPanelShow(showId),
          fetchProjectBranchContext(supabase, projectId, branchId || null),
          fetchJson<MeResponse>("/api/auth/me").catch(() => ({
            profile: READONLY_AUTH_PROFILE,
          })),
        ]);

        const { data: panelRows, error: panelError } = await supabase
          .from("zentai_gamen")
          .select("*")
          .in("id", show.panel_ids)
          .eq("branch_id", show.branch_id);
        if (panelError) throw panelError;

        if (cancelled) return;

        const map = new Map<string, ZentaiGamen>();
        ((panelRows ?? []) as ZentaiGamen[]).forEach((p) => map.set(p.id, p));

        applyShow(show);
        setPanelMap(map);
        setPanelIds(show.panel_ids);
        setHasMissingPanels(
          show.panel_ids.some((id) => !map.has(id))
        );
        setGridWidth(context.projectView.grid_width);
        setGridHeight(context.projectView.grid_height);
        setCanEdit(
          computeCanEdit(meResult.profile, context.currentBranch)
        );
        skipNextSaveRef.current = true;
        setLoaded(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "パネルショーを読み込めませんでした"
        );
        setLoading(false);
      }
    }

    function applyShow(show: PanelShow) {
      setRows(show.rows);
      setCols(show.cols);
      setPlacements(Array.isArray(show.placements) ? show.placements : []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [branchId, projectId, showId, supabase]);

  // Debounced autosave
  useEffect(() => {
    if (loading || !canEdit) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    setSaveStatus("saving");
    const handle = setTimeout(() => {
      void (async () => {
        try {
          await updatePanelShow(showId, branchId, { rows, cols, placements });
          setSaveStatus("saved");
          setSaveError(null);
        } catch {
          setSaveStatus("idle");
          setSaveError("保存に失敗しました");
        }
      })();
    }, 700);

    return () => clearTimeout(handle);
  }, [rows, cols, placements, loading, canEdit, showId, branchId]);

  const validPlacements = useMemo(
    () =>
      placements.filter(
        (p) =>
          p.row < rows &&
          p.col < cols &&
          p.row >= 0 &&
          p.col >= 0 &&
          panelMap.has(p.panel_id)
      ),
    [placements, rows, cols, panelMap]
  );

  const placedByCell = useMemo(() => {
    const m = new Map<string, string>();
    validPlacements.forEach((p) => m.set(cellKey(p.row, p.col), p.panel_id));
    return m;
  }, [validPlacements]);

  const trayPanels = useMemo(() => {
    const placedIds = new Set(validPlacements.map((p) => p.panel_id));
    return panelIds.filter((id) => panelMap.has(id) && !placedIds.has(id));
  }, [panelIds, panelMap, validPlacements]);

  const handleDrop = useCallback(
    (panelId: string, origin: Cell, clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const cellEl = el?.closest("[data-cell]") as HTMLElement | null;
      let target: Cell = null;
      if (cellEl) {
        const r = Number(cellEl.dataset.row);
        const c = Number(cellEl.dataset.col);
        if (Number.isFinite(r) && Number.isFinite(c)) {
          target = { row: r, col: c };
        }
      }
      setPlacements((prev) => applyPlacement(prev, panelId, target, origin));
    },
    []
  );

  const bindDrag = useDrag(
    ({ args, xy, first, last }) => {
      const [panelId, origin] = args as [string, Cell];
      if (first) {
        setDrag({ panelId, x: xy[0], y: xy[1] });
      } else if (last) {
        handleDrop(panelId, origin, xy[0], xy[1]);
        setDrag(null);
      } else {
        setDrag((d) => (d ? { ...d, x: xy[0], y: xy[1] } : d));
      }
    },
    { pointer: { touch: true }, filterTaps: true }
  );

  const clampDim = (value: number) =>
    Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(value) || MIN_DIM));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        読み込み中...
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        {error ?? "パネルショーを読み込めませんでした"}
      </div>
    );
  }

  const aspectRatio = gridWidth > 0 && gridHeight > 0 ? gridWidth / gridHeight : 1;
  const dragPanel = drag ? panelMap.get(drag.panelId) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-card-border">
        <label className="flex items-center gap-2 text-sm text-foreground">
          縦
          <input
            type="number"
            min={MIN_DIM}
            max={MAX_DIM}
            value={rows}
            disabled={!canEdit}
            onChange={(e) => setRows(clampDim(Number(e.target.value)))}
            className="w-16 px-2 py-1 bg-card border border-card-border rounded text-foreground focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          横
          <input
            type="number"
            min={MIN_DIM}
            max={MAX_DIM}
            value={cols}
            disabled={!canEdit}
            onChange={(e) => setCols(clampDim(Number(e.target.value)))}
            className="w-16 px-2 py-1 bg-card border border-card-border rounded text-foreground focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        <span className="text-xs text-muted">
          {saveStatus === "saving"
            ? "保存中..."
            : saveStatus === "saved"
            ? "保存しました"
            : ""}
        </span>
        {saveError && <span className="text-xs text-danger">{saveError}</span>}
        {!canEdit && (
          <span className="text-xs text-muted">閲覧のみ（編集不可）</span>
        )}
        {hasMissingPanels && (
          <span className="text-xs text-danger">
            一部のパネルは削除されています
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* White-background grid */}
        <div
          className="mx-auto bg-white rounded-lg shadow-inner p-2"
          style={{ maxWidth: 960 }}
        >
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: rows * cols }).map((_, i) => {
              const row = Math.floor(i / cols);
              const col = i % cols;
              const panelId = placedByCell.get(cellKey(row, col));
              const panel = panelId ? panelMap.get(panelId) : undefined;
              return (
                <div
                  key={cellKey(row, col)}
                  data-cell="1"
                  data-row={row}
                  data-col={col}
                  className="relative border border-gray-200 bg-white overflow-hidden flex items-center justify-center"
                  style={{ aspectRatio }}
                >
                  {panel ? (
                    <div
                      {...(canEdit
                        ? bindDrag(panel.id, { row, col } as Cell)
                        : {})}
                      className="w-full h-full"
                      style={{ touchAction: canEdit ? "none" : undefined }}
                    >
                      <PanelCanvas
                        gridData={panel.grid_data}
                        gridWidth={gridWidth}
                        gridHeight={gridHeight}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tray of unplaced panels */}
      <div className="border-t border-card-border px-4 py-3">
        <p className="text-xs text-muted mb-2">
          未配置のパネル（{trayPanels.length}）
          {canEdit && trayPanels.length > 0 && " — マス目へドラッグ"}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {trayPanels.length === 0 && (
            <span className="text-xs text-muted">すべて配置済み</span>
          )}
          {trayPanels.map((id) => {
            const panel = panelMap.get(id);
            if (!panel) return null;
            return (
              <div
                key={id}
                {...(canEdit ? bindDrag(id, null) : {})}
                className="shrink-0 w-24 rounded border border-card-border bg-card p-1 select-none"
                style={{ touchAction: canEdit ? "none" : undefined }}
              >
                <PanelCanvas
                  gridData={panel.grid_data}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                />
                <p className="mt-1 text-[10px] text-foreground truncate">
                  {panel.name}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag ghost */}
      {drag && dragPanel && (
        <div
          className="pointer-events-none fixed z-50 w-28 opacity-80"
          style={{
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <PanelCanvas
            gridData={dragPanel.grid_data}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
          />
        </div>
      )}
    </div>
  );
}
