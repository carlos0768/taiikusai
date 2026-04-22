"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { encodeGrid, decodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid, type GridData } from "@/lib/grid/types";
import { parseExcel, parseCsv } from "@/lib/import/parseSpreadsheet";
import { findPlaybackRoutes } from "@/lib/api/connections";
import type {
  AuthProfile,
  Connection as DBConnection,
  Project,
  ProjectBranch,
  Template,
  ZentaiGamen,
} from "@/types";
import CameraCapture from "@/components/scan/CameraCapture";
import ContextMenu, { type SubMenuItem } from "./ContextMenu";
import ConnectionEdge from "./ConnectionEdge";
import NodeDeleteMenu from "./NodeDeleteMenu";
import PlaybackPanel from "./PlaybackPanel";
import Sidebar from "./Sidebar";
import ZentaiGamenNode from "./ZentaiGamenNode";

const nodeTypes = { zentaiGamen: ZentaiGamenNode };
const edgeTypes = { connection: ConnectionEdge };

interface DashboardCanvasProps {
  project: Project;
  initialZentaiGamen: ZentaiGamen[];
  initialConnections: DBConnection[];
  auth: AuthProfile;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  unreadGitNotifications: number;
}

function branchQuery(branchName: string) {
  return branchName === "main" ? "" : `?branch=${branchName}`;
}

function DashboardCanvasInner({
  project,
  initialZentaiGamen,
  initialConnections,
  auth,
  branches,
  currentBranch,
  unreadGitNotifications,
}: DashboardCanvasProps) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const reactFlowInstance = useReactFlow();
  const currentBranchQuery = branchQuery(currentBranch.name);
  const canEditCurrentBranch = useMemo(() => {
    if (auth.is_admin) return true;
    if (!auth.permissions.can_edit_branch_content) return false;
    if (!currentBranch.is_main) return true;
    return !project.main_branch_requires_admin_approval;
  }, [auth, currentBranch.is_main, project.main_branch_requires_admin_approval]);
  const canCreateBranches = auth.is_admin || auth.permissions.can_create_branches;
  const canRequestMerge =
    !currentBranch.is_main &&
    (auth.is_admin || auth.permissions.can_request_main_merge);
  const canViewGit =
    auth.is_admin ||
    auth.permissions.can_view_git_requests ||
    auth.permissions.can_request_main_merge ||
    auth.permissions.can_create_branches;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [zentaiGamenList, setZentaiGamenList] =
    useState<ZentaiGamen[]>(initialZentaiGamen);
  const [connectionList, setConnectionList] =
    useState<DBConnection[]>(initialConnections);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeRef = useRef<"xlsx" | "csv">("xlsx");

  const [showCamera, setShowCamera] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  const [playbackData, setPlaybackData] = useState<{
    frames: GridData[];
    frameNames: string[];
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeName: string;
  } | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      router.push(`/project/${project.id}/editor/${nodeId}${currentBranchQuery}`);
    },
    [project.id, currentBranchQuery, router]
  );

  const handleNodeLongPress = useCallback(
    (nodeId: string, nodeName: string, x: number, y: number) => {
      setContextMenu(null);
      setNodeMenu({ x, y, nodeId, nodeName });
    },
    []
  );

  const buildNodes = useCallback(
    (nextZentaiGamen: ZentaiGamen[], nextConnections: DBConnection[]): Node[] => {
      const sourceIds = new Set(nextConnections.map((connection) => connection.source_id));
      return nextZentaiGamen.map((item) => ({
        id: item.id,
        type: "zentaiGamen",
        position: { x: item.position_x, y: item.position_y },
        data: {
          name: item.name,
          gridData: item.grid_data,
          gridWidth: project.grid_width,
          gridHeight: project.grid_height,
          hasOutgoingEdge: sourceIds.has(item.id),
          onDoubleClick: handleNodeDoubleClick,
          onLongPress: handleNodeLongPress,
        },
      }));
    },
    [
      handleNodeDoubleClick,
      handleNodeLongPress,
      project.grid_height,
      project.grid_width,
    ]
  );

  const buildEdges = useCallback((nextConnections: DBConnection[]): Edge[] => {
    return nextConnections.map((connection) => ({
      id: connection.id,
      source: connection.source_id,
      target: connection.target_id,
      type: "connection",
      markerEnd: undefined,
    }));
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes(initialZentaiGamen, initialConnections)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildEdges(initialConnections)
  );

  useEffect(() => {
    setZentaiGamenList(initialZentaiGamen);
    setConnectionList(initialConnections);
    setNodes(buildNodes(initialZentaiGamen, initialConnections));
    setEdges(buildEdges(initialConnections));
  }, [
    initialConnections,
    initialZentaiGamen,
    buildEdges,
    buildNodes,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, [supabase]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!canEditCurrentBranch) return;
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const { data, error } = await supabase
        .from("connections")
        .insert({
          project_id: project.id,
          branch_id: currentBranch.id,
          source_id: connection.source,
          target_id: connection.target,
          sort_order: 0,
        })
        .select()
        .single();

      if (error || !data) {
        setActionError(error?.message ?? "接続の追加に失敗しました");
        return;
      }

      const nextConnection = data as DBConnection;
      setConnectionList((prev) => [...prev, nextConnection]);
      setEdges((existingEdges) =>
        addEdge(
          {
            ...connection,
            id: nextConnection.id,
            type: "connection",
            markerEnd: undefined,
          },
          existingEdges
        )
      );
      setNodes((existingNodes) =>
        existingNodes.map((node) =>
          node.id === connection.source
            ? { ...node, data: { ...node.data, hasOutgoingEdge: true } }
            : node
        )
      );
    },
    [
      canEditCurrentBranch,
      currentBranch.id,
      project.id,
      setEdges,
      setNodes,
      supabase,
    ]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    async (_, edge) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase.from("connections").delete().eq("id", edge.id);
      if (error) {
        setActionError(error.message);
        return;
      }

      setConnectionList((prev) => prev.filter((connection) => connection.id !== edge.id));
      setEdges((existingEdges) => existingEdges.filter((item) => item.id !== edge.id));
    },
    [canEditCurrentBranch, setEdges, supabase]
  );

  const onNodeDragStop = useCallback(
    async (_event: unknown, node: Node) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase
        .from("zentai_gamen")
        .update({ position_x: node.position.x, position_y: node.position.y })
        .eq("id", node.id);

      if (error) {
        setActionError(error.message);
        return;
      }

      setZentaiGamenList((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? { ...item, position_x: node.position.x, position_y: node.position.y }
            : item
        )
      );
    },
    [canEditCurrentBranch, supabase]
  );

  const onPanePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!canEditCurrentBranch) return;

      longPressStartRef.current = { x: event.clientX, y: event.clientY };
      longPressTimerRef.current = setTimeout(() => {
        setNodeMenu(null);
        const flowPosition = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        setContextMenu({
          screenX: event.clientX,
          screenY: event.clientY,
          flowX: flowPosition.x,
          flowY: flowPosition.y,
        });
      }, 500);
    },
    [canEditCurrentBranch, reactFlowInstance]
  );

  const onPanePointerMove = useCallback((event: React.PointerEvent) => {
    if (!longPressStartRef.current) return;

    const dx = event.clientX - longPressStartRef.current.x;
    const dy = event.clientY - longPressStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onPanePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const nodeData = node.data as { name?: string };
      setNodeMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodeName: nodeData.name ?? "Untitled",
      });
    },
    []
  );

  const createAndNavigate = useCallback(
    async (gridData: string, name: string) => {
      if (!canEditCurrentBranch) return;

      const positionX = contextMenu?.flowX ?? 0;
      const positionY = contextMenu?.flowY ?? 0;

      const { data, error } = await supabase
        .from("zentai_gamen")
        .insert({
          project_id: project.id,
          branch_id: currentBranch.id,
          name,
          grid_data: gridData,
          position_x: positionX,
          position_y: positionY,
        })
        .select()
        .single();

      setContextMenu(null);
      if (error || !data) {
        setActionError(error?.message ?? "画面を作成できませんでした");
        return;
      }

      router.push(`/project/${project.id}/editor/${data.id}${currentBranchQuery}`);
    },
    [
      canEditCurrentBranch,
      contextMenu,
      currentBranch.id,
      currentBranchQuery,
      project.id,
      router,
      supabase,
    ]
  );

  const handleCreateManual = useCallback(async () => {
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    await createAndNavigate(encodeGrid(emptyGrid), "Untitled");
  }, [createAndNavigate, project.grid_height, project.grid_width]);

  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      const template = templates.find((item) => item.id === templateId);
      if (!template) return;
      await createAndNavigate(template.grid_data, `${template.name} (コピー)`);
    },
    [createAndNavigate, templates]
  );

  const handleSelectExisting = useCallback(
    async (zentaiGamenId: string) => {
      const existing = zentaiGamenList.find((item) => item.id === zentaiGamenId);
      if (!existing) return;
      await createAndNavigate(existing.grid_data, `${existing.name} (コピー)`);
    },
    [createAndNavigate, zentaiGamenList]
  );

  const handleImportFile = useCallback((type: "xlsx" | "csv") => {
    if (!canEditCurrentBranch) return;
    fileTypeRef.current = type;
    setContextMenu(null);
    setTimeout(() => fileInputRef.current?.click(), 100);
  }, [canEditCurrentBranch]);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";

      try {
        let cells: Uint8Array;
        if (fileTypeRef.current === "csv") {
          const text = await file.text();
          cells = parseCsv(text, project.grid_width, project.grid_height).cells;
        } else {
          const buffer = await file.arrayBuffer();
          cells = parseExcel(buffer, project.grid_width, project.grid_height).cells;
        }

        let binary = "";
        for (let index = 0; index < cells.length; index += 1) {
          binary += String.fromCharCode(cells[index]);
        }

        await createAndNavigate(btoa(binary), file.name.replace(/\.\w+$/, ""));
      } catch {
        setActionError("ファイルの読み込みに失敗しました");
      }
    },
    [createAndNavigate, project.grid_height, project.grid_width]
  );

  const handleScan = useCallback(() => {
    if (!canEditCurrentBranch) return;
    setContextMenu(null);
    setShowCamera(true);
  }, [canEditCurrentBranch]);

  const handleScanCapture = useCallback(
    async (imageBase64: string) => {
      setShowCamera(false);
      setScanProcessing(true);

      try {
        const response = await fetchJson<{ gridData: string }>("/api/scan", {
          method: "POST",
          body: JSON.stringify({
            image: imageBase64,
            gridWidth: project.grid_width,
            gridHeight: project.grid_height,
          }),
        });

        await createAndNavigate(response.gridData, "スキャン");
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "スキャンに失敗しました");
      } finally {
        setScanProcessing(false);
      }
    },
    [createAndNavigate, project.grid_height, project.grid_width]
  );

  const handleDeleteNode = useCallback(async () => {
    if (!canEditCurrentBranch || !nodeMenu) return;

    const { error } = await supabase.from("zentai_gamen").delete().eq("id", nodeMenu.nodeId);
    if (error) {
      setActionError(error.message);
      return;
    }

    setZentaiGamenList((prev) => prev.filter((item) => item.id !== nodeMenu.nodeId));
    setConnectionList((prev) =>
      prev.filter(
        (connection) =>
          connection.source_id !== nodeMenu.nodeId &&
          connection.target_id !== nodeMenu.nodeId
      )
    );
    setNodes((prev) => prev.filter((node) => node.id !== nodeMenu.nodeId));
    setEdges((prev) =>
      prev.filter(
        (edge) => edge.source !== nodeMenu.nodeId && edge.target !== nodeMenu.nodeId
      )
    );
    setNodeMenu(null);
  }, [canEditCurrentBranch, nodeMenu, setEdges, setNodes, supabase]);

  const handleRenameNode = useCallback(
    async (newName: string) => {
      if (!canEditCurrentBranch || !nodeMenu) return;

      const { error } = await supabase
        .from("zentai_gamen")
        .update({ name: newName })
        .eq("id", nodeMenu.nodeId);

      if (error) {
        setActionError(error.message);
        return;
      }

      setZentaiGamenList((prev) =>
        prev.map((item) =>
          item.id === nodeMenu.nodeId ? { ...item, name: newName } : item
        )
      );
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeMenu.nodeId
            ? { ...node, data: { ...node.data, name: newName } }
            : node
        )
      );
    },
    [canEditCurrentBranch, nodeMenu, setNodes, supabase]
  );

  const handlePlayFromNode = useCallback(() => {
    if (!nodeMenu) return;

    const routes = findPlaybackRoutes(connectionList, nodeMenu.nodeId);
    const route = routes[0];
    if (!route || route.length === 0) {
      setActionError("再生できるルートがありません");
      return;
    }

    const zentaiGamenMap = new Map(zentaiGamenList.map((item) => [item.id, item]));
    const frames: GridData[] = [];
    const frameNames: string[] = [];

    route.forEach((nodeId) => {
      const item = zentaiGamenMap.get(nodeId);
      if (!item) return;
      frames.push(decodeGrid(item.grid_data, project.grid_width, project.grid_height));
      frameNames.push(item.name);
    });

    if (frames.length > 0) {
      setPlaybackData({ frames, frameNames });
      setNodeMenu(null);
    }
  }, [connectionList, nodeMenu, project.grid_height, project.grid_width, zentaiGamenList]);

  const handleCreateBranch = useCallback(async () => {
    if (!canCreateBranches) return;

    const name = window.prompt("新しいブランチ名を入力してください（英数字小文字）");
    if (!name) return;

    try {
      const response = await fetchJson<{ branch: ProjectBranch }>(
        `/api/projects/${project.id}/branches`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            sourceBranchName: currentBranch.name,
          }),
        }
      );

      router.push(`/project/${project.id}${branchQuery(response.branch.name)}`);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ブランチを作成できませんでした");
    }
  }, [canCreateBranches, currentBranch.name, project.id, router]);

  const handleSwitchBranch = useCallback(
    (nextBranchName: string) => {
      router.push(`/project/${project.id}${branchQuery(nextBranchName)}`);
      router.refresh();
    },
    [project.id, router]
  );

  const handleRequestMerge = useCallback(async () => {
    if (!canRequestMerge) return;

    const summary = window.prompt(
      "main への反映内容を簡単に入力してください",
      ""
    );

    try {
      await fetchJson(`/api/projects/${project.id}/requests`, {
        method: "POST",
        body: JSON.stringify({
          branchName: currentBranch.name,
          summary: summary ?? "",
        }),
      });

      setActionError(null);
      window.alert("main への申請を作成しました");
      router.push(`/project/${project.id}/git/requests${currentBranchQuery}`);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "申請を作成できませんでした");
    }
  }, [
    canRequestMerge,
    currentBranch.name,
    currentBranchQuery,
    project.id,
    router,
  ]);

  const templateMenuItems: SubMenuItem[] = templates.map((item) => ({
    id: item.id,
    label: item.name,
  }));
  const existingMenuItems: SubMenuItem[] = zentaiGamenList.map((item) => ({
    id: item.id,
    label: item.name,
  }));

  return (
    <div className="h-full w-full flex">
      <div className="flex-1 h-full relative">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelected}
        />

        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-4 left-4 z-30 w-10 h-10 flex flex-col items-center justify-center gap-1 bg-card border border-card-border rounded-lg hover:border-accent/50 transition-colors"
          aria-label="メニュー"
        >
          {unreadGitNotifications > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-sky-500" />
          )}
          <span className="w-4 h-0.5 bg-foreground" />
          <span className="w-4 h-0.5 bg-foreground" />
          <span className="w-4 h-0.5 bg-foreground" />
        </button>

        <div className="absolute left-16 right-4 top-4 z-20">
          <div className="rounded-xl border border-card-border bg-card/95 px-3 py-3 backdrop-blur-sm shadow-lg">
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
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  currentBranch.is_main
                    ? "bg-accent/20 text-accent"
                    : "bg-sky-500/15 text-sky-300"
                }`}
              >
                {currentBranch.is_main ? "main" : "作業ブランチ"}
              </span>
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
              {canViewGit && (
                <button
                  onClick={() => router.push(`/project/${project.id}/git/requests${currentBranchQuery}`)}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground transition-colors"
                >
                  Git / リクエスト
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>
                {canEditCurrentBranch
                  ? "このブランチは編集できます"
                  : currentBranch.is_main
                    ? "main は保護中です。編集は作業ブランチで行ってください"
                    : "このアカウントは閲覧専用です"}
              </span>
              {project.main_branch_requires_admin_approval && (
                <span>main 反映は admin 承認制です</span>
              )}
            </div>
            {actionError && (
              <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {actionError}
              </div>
            )}
          </div>
        </div>

        {scanProcessing && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-foreground">スキャン中...</p>
            </div>
          </div>
        )}

        <div
          className="h-full w-full"
          onPointerDown={onPanePointerDown}
          onPointerMove={onPanePointerMove}
          onPointerUp={onPanePointerUp}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.1}
            maxZoom={3}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            connectionRadius={80}
            connectionLineStyle={{ stroke: "#FFD700", strokeWidth: 3 }}
            className="!bg-background"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#333"
            />
          </ReactFlow>
        </div>

        {contextMenu && canEditCurrentBranch && (
          <ContextMenu
            x={contextMenu.screenX}
            y={contextMenu.screenY}
            onManual={handleCreateManual}
            onScan={handleScan}
            onSelectTemplate={handleSelectTemplate}
            onSelectExisting={handleSelectExisting}
            onImportFile={handleImportFile}
            onClose={() => setContextMenu(null)}
            templates={templateMenuItems}
            existingDesigns={existingMenuItems}
          />
        )}

        {nodeMenu && (
          <NodeDeleteMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            nodeName={nodeMenu.nodeName}
            onDelete={handleDeleteNode}
            onRename={handleRenameNode}
            onPlay={handlePlayFromNode}
            onClose={() => setNodeMenu(null)}
            canEdit={canEditCurrentBranch}
          />
        )}

        {showCamera && (
          <CameraCapture
            onCapture={handleScanCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          projectId={project.id}
          projectName={project.name}
          branchName={currentBranch.name}
          showGitBadge={unreadGitNotifications > 0}
          showGit={canViewGit}
        />
      </div>

      {playbackData && (
        <PlaybackPanel
          frames={playbackData.frames}
          frameNames={playbackData.frameNames}
          onClose={() => setPlaybackData(null)}
        />
      )}
    </div>
  );
}

export default function DashboardCanvas(props: DashboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <DashboardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
