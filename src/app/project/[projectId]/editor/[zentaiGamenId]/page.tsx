"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import {
  canCreateBranches,
  canEditBranch,
  canRequestMerge,
  READONLY_AUTH_PROFILE,
} from "@/lib/client/authProfile";
import { decodeGrid } from "@/lib/grid/codec";
import {
  countUndefinedCells,
  getPlaybackFrameFinalGrid,
  type ColorIndex,
  type GridData,
} from "@/lib/grid/types";
import GridEditor, { type GridEditorSavePayload } from "@/components/editor/GridEditor";
import { findPlaybackRoutes } from "@/lib/api/connections";
import {
  generateScriptInnerHtml,
  getPanelScriptRowLabel,
} from "@/lib/export/generateScript";
import { decodeKeepMask, filterKeepMaskBySameColor, isKeepCell } from "@/lib/keep";
import { zentaiGamenToPlaybackFrame } from "@/lib/playback/frameBuilder";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import type {
  AuthProfile,
  BranchScopedProject,
  Connection,
  GitNotificationSummary,
  ProjectBranch,
  ZentaiGamen,
} from "@/types";

interface MeResponse {
  profile: AuthProfile;
}

interface ExportProgress {
  completed: number;
  total: number;
}

function createPdfSourceElement(innerHtml: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.width = "748px";
  element.style.minHeight = "0";
  element.style.background = "#fff";
  element.style.overflow = "visible";
  element.style.pointerEvents = "none";
  element.innerHTML = innerHtml;
  document.body.appendChild(element);
  return element;
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function createPdfBlobFromElement(element: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const width = Math.ceil(element.scrollWidth);
  const height = Math.ceil(element.scrollHeight);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
  });
  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageData = canvas.toDataURL("image/jpeg", 0.98);
  const canvasRatio = canvas.width / canvas.height;
  const pageRatio = pageWidth / pageHeight;
  const imageWidth =
    canvasRatio > pageRatio ? pageWidth : pageHeight * canvasRatio;
  const imageHeight =
    canvasRatio > pageRatio ? pageWidth / canvasRatio : pageHeight;
  const x = (pageWidth - imageWidth) / 2;
  const y = (pageHeight - imageHeight) / 2;

  pdf.addImage(imageData, "JPEG", x, y, imageWidth, imageHeight);

  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const zentaiGamenId = params.zentaiGamenId as string;
  const requestedBranchId = searchParams.get("branch");
  const supabase = useMemo(() => createClient(), []);

  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [branches, setBranches] = useState<ProjectBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<ProjectBranch | null>(null);
  const [auth, setAuth] = useState<AuthProfile>(READONLY_AUTH_PROFILE);
  const [unreadGitNotifications, setUnreadGitNotifications] = useState(0);
  const [grid, setGrid] = useState<GridData | null>(null);
  const [afterGrid, setAfterGrid] = useState<GridData | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);

      try {
        const [context, zentaiGamenResult] = await Promise.all([
          fetchProjectBranchContext(supabase, projectId, requestedBranchId),
          supabase
            .from("zentai_gamen")
            .select("*")
            .eq("id", zentaiGamenId)
            .eq("project_id", projectId)
            .single(),
        ]);
        const { data: zg, error: zentaiGamenError } = zentaiGamenResult;

        if (
          zentaiGamenError ||
          !zg ||
          zg.branch_id !== context.currentBranch.id
        ) {
          throw zentaiGamenError ?? new Error("対象の画面が見つかりません");
        }

        setProject(context.projectView);
        setBranches(context.branches);
        setCurrentBranch(context.currentBranch);
        setZentaiGamen(zg as ZentaiGamen);
        setGrid(
          decodeGrid(
            zg.grid_data,
            context.projectView.grid_width,
            context.projectView.grid_height
          )
        );

        if (
          zg.panel_type === "motion" &&
          zg.motion_type === "wave" &&
          zg.motion_data
        ) {
          setAfterGrid(
            decodeGrid(
              zg.motion_data.after_grid_data,
              context.projectView.grid_width,
              context.projectView.grid_height
            )
          );
        } else {
          setAfterGrid(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "エディタを読み込めませんでした");
      }
    }

    void load();
  }, [projectId, requestedBranchId, supabase, zentaiGamenId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const [{ profile }, notifications] = await Promise.all([
          fetchJson<MeResponse>("/api/auth/me"),
          fetchJson<GitNotificationSummary>(
            `/api/notifications/unread?projectId=${projectId}`
          ).catch(() => ({ unreadCount: 0, hasUnread: false })),
        ]);
        if (cancelled) return;
        setAuth(profile);
        setUnreadGitNotifications(notifications.unreadCount);
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  const handleSave = useCallback(
    async (payload: GridEditorSavePayload) => {
      if (!currentBranch) return;

      const update: Record<string, unknown> = {
        grid_data: payload.gridData,
        name: payload.name,
        memo: payload.memo,
        updated_at: new Date().toISOString(),
      };
      if (payload.motionData !== undefined) {
        update.motion_data = payload.motionData;
      }

      const { error: updateError } = await supabase
        .from("zentai_gamen")
        .update(update)
        .eq("id", zentaiGamenId)
        .eq("project_id", projectId)
        .eq("branch_id", currentBranch.id);

      if (updateError) {
        throw updateError;
      }
    },
    [currentBranch, projectId, supabase, zentaiGamenId]
  );

  const handleExport = useCallback(async (
    onProgress?: (progress: ExportProgress) => void
  ) => {
    if (!project || !currentBranch) return;

    const [{ data: allZg, error: zentaiGamenError }, { data: allConns, error: connectionsError }] =
      await Promise.all([
        supabase
          .from("zentai_gamen")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", currentBranch.id),
        supabase
          .from("connections")
          .select("*")
          .eq("project_id", projectId)
          .eq("branch_id", currentBranch.id),
      ]);

    if (zentaiGamenError || connectionsError || !allZg || !allConns) {
      throw new Error("データの取得に失敗しました");
    }

    const routes = findPlaybackRoutes(allConns as Connection[], zentaiGamenId);
    const route = routes[0];
    if (!route || route.length === 0) {
      throw new Error("連結された全体画面がありません");
    }

    const zentaiGamenMap = new Map(
      (allZg as ZentaiGamen[]).map((item) => [item.id, item])
    );
    const width = project.grid_width;
    const height = project.grid_height;
    const connectionMap = new Map(
      (allConns as Connection[]).map((connection) => [
        `${connection.source_id}:${connection.target_id}`,
        connection,
      ])
    );
    const scenes: {
      name: string;
      grid: GridData;
      beforeGrid: GridData | null;
      keepMask: GridData | null;
      memo: string;
    }[] = [];

    route.forEach((nodeId, index) => {
      const item = zentaiGamenMap.get(nodeId);
      if (!item) return;

      const frame = zentaiGamenToPlaybackFrame({
        zentaiGamen: item,
        gridWidth: width,
        gridHeight: height,
        defaultPanelDurationMs: project.default_panel_duration_ms,
      });
      const grid = getPlaybackFrameFinalGrid(frame);
      const previousNodeId = route[index - 1];
      const previousConnection = previousNodeId
        ? connectionMap.get(`${previousNodeId}:${nodeId}`)
        : null;
      const previousScene = scenes[scenes.length - 1];
      const rawKeepMask = decodeKeepMask(
        previousConnection?.keep_mask_grid_data,
        width,
        height
      );
      const keepMask =
        rawKeepMask && previousScene
          ? filterKeepMaskBySameColor(previousScene.grid, grid, rawKeepMask)
          : null;

      scenes.push({
        name: item.name,
        grid,
        beforeGrid: frame.kind === "wave" ? frame.before : null,
        keepMask,
        memo: item.memo || "",
      });
    });

    if (scenes.length === 0) {
      throw new Error("シーンデータがありません");
    }

    const undefinedReport: { name: string; count: number }[] = [];
    for (const scene of scenes) {
      const count =
        countUndefinedCells(scene.grid) +
        (scene.beforeGrid ? countUndefinedCells(scene.beforeGrid) : 0);
      if (count > 0) {
        undefinedReport.push({ name: scene.name, count });
      }
    }

    if (undefinedReport.length > 0) {
      const lines = undefinedReport
        .map((r) => `・${r.name}（${r.count}セル）`)
        .join("\n");
      const ok = window.confirm(
        `連結されたパネルに未塗りのセルが残っています。\n\n${lines}\n\nこのまま出力しますか？`
      );
      if (!ok) return;
    }

    const zip = new JSZip();
    const rowDigits = String(height).length;
    const colDigits = String(width).length;
    const total = width * height;
    let completed = 0;

    onProgress?.({ completed, total });

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellIndex = y * width + x;
        const cellScenes = scenes.map((scene, index) => ({
          sceneNumber: index + 1,
          action: isKeepCell(scene.keepMask, cellIndex)
            ? ("keep" as const)
            : ("color" as const),
          colorIndex: scene.grid.cells[cellIndex] as ColorIndex,
          memo: scene.memo,
        }));

        const innerHtml = generateScriptInnerHtml(
          x,
          y,
          cellScenes,
          project.name
        );

        const pdfSource = createPdfSourceElement(innerHtml);
        let pdfBlob: Blob;

        try {
          await waitForFrame();
          pdfBlob = await createPdfBlobFromElement(pdfSource);
        } finally {
          pdfSource.remove();
        }

        const rowSort = String(y + 1).padStart(rowDigits, "0");
        const colLabel = String(x + 1).padStart(colDigits, "0");
        zip.file(
          `${rowSort}_${getPanelScriptRowLabel(y)}列${colLabel}番.pdf`,
          pdfBlob
        );
        completed += 1;
        onProgress?.({ completed, total });
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${project.name}_パネル台本.zip`);
  }, [currentBranch, project, projectId, supabase, zentaiGamenId]);

  if (error || !project || !currentBranch || !grid || !zentaiGamen) {
    return (
      <div className="h-full flex items-center justify-center">
        {error && <p className="text-muted">{error}</p>}
      </div>
    );
  }

  return (
    <GridEditor
      initialGrid={grid}
      initialAfterGrid={afterGrid}
      panelType={zentaiGamen.panel_type ?? "general"}
      motionType={zentaiGamen.motion_type ?? null}
      initialMotionData={zentaiGamen.motion_data ?? null}
      zentaiGamenId={zentaiGamenId}
      projectId={projectId}
      branchId={currentBranch.id}
      initialName={zentaiGamen.name}
      initialMemo={zentaiGamen.memo || ""}
      onSave={handleSave}
      onExport={handleExport}
      auth={auth}
      currentBranch={currentBranch}
      branches={branches}
      unreadGitNotifications={unreadGitNotifications}
      canEditCurrentBranch={canEditBranch(auth, currentBranch)}
      canCreateBranches={canCreateBranches(auth)}
      canRequestMerge={canRequestMerge(auth, currentBranch)}
    />
  );
}
