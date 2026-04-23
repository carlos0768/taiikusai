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
  type Node,
  type Edge,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid, encodeGrid } from "@/lib/grid/codec";
import { buildBranchPath } from "@/lib/projectBranches";
import type {
  AuthProfile,
  BranchScopedProject,
  MusicData,
  MotionType,
  PanelType,
  ProjectBranch,
  Template,
  WaveMotionData,
  ZentaiGamen,
  Connection as DBConnection,
} from "@/types";
import { updateProjectMusic } from "@/lib/api/projects";
import { parseExcel, parseCsv } from "@/lib/import/parseSpreadsheet";
import { findPlaybackRoutes } from "@/lib/api/connections";
import {
  buildPlaybackTimeline,
  type PlaybackTimeline,
} from "@/lib/playback/frameBuilder";
import { createEmptyGrid } from "@/lib/grid/types";
import { createKeepMaskGrid } from "@/lib/keep";
import { resizeGrid } from "@/lib/grid/resize";
import { DEFAULT_WAVE_MOTION_DATA } from "@/types";
import CameraCapture from "@/components/scan/CameraCapture";
import ZentaiGamenNode from "./ZentaiGamenNode";
import ConnectionEdge from "./ConnectionEdge";
import ContextMenu, { type SubMenuItem } from "./ContextMenu";
import NodeDeleteMenu from "./NodeDeleteMenu";
import Sidebar from "./Sidebar";
import PlaybackPanel from "./PlaybackPanel";
import ProjectBranchSwitcher from "./ProjectBranchSwitcher";

const nodeTypes = { zentaiGamen: ZentaiGamenNode };
const edgeTypes = { connection: ConnectionEdge };

interface DashboardCanvasProps {
  project: BranchScopedProject;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  initialZentaiGamen: ZentaiGamen[];
  initialConnections: DBConnection[];
  auth: AuthProfile;
  unreadGitNotifications: number;
}

function DashboardCanvasInner({
  project,
  branches,
  currentBranch,
  initialZentaiGamen,
  initialConnections,
  auth,
  unreadGitNotifications,
}: DashboardCanvasProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const reactFlowInstance = useReactFlow();

  const canEditCurrentBranch = useMemo(() => {
    if (auth.is_admin) return true;
    if (currentBranch.is_main) return false;
    if (auth.permissions.can_edit_branch_content) return true;
    return (
      auth.permissions.can_create_branches &&
      currentBranch.created_by === auth.id
    );
  }, [
    auth.id,
    auth.is_admin,
    auth.permissions.can_create_branches,
    auth.permissions.can_edit_branch_content,
    currentBranch.created_by,
    currentBranch.is_main,
  ]);
  const canCreateBranches = auth.is_admin || auth.permissions.can_create_branches;
  const canRequestMerge =
    !currentBranch.is_main &&
    (auth.is_admin || auth.permissions.can_request_main_merge);
  const canViewGit =
    auth.is_admin ||
    auth.permissions.can_view_git_requests ||
    auth.permissions.can_request_main_merge ||
    auth.permissions.can_create_branches;
  const showGitBadge = canViewGit && unreadGitNotifications > 0;

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
  const [playbackData, setPlaybackData] = useState<PlaybackTimeline | null>(null);

  const [currentMusic, setCurrentMusic] = useState<MusicData | null>(
    project.music_data ?? null
  );

  useEffect(() => {
    setCurrentMusic(project.music_data ?? null);
  }, [project.music_data, project.active_branch_id]);

  const handleMusicChange = useCallback(
    async (data: MusicData | null) => {
      setCurrentMusic(data);
      await updateProjectMusic(
        project.id,
        project.active_branch_id,
        project.active_branch_is_main,
        data
      );
    },
    [project.id, project.active_branch_id, project.active_branch_is_main]
  );

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

  useEffect(() => {
    supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, [supabase]);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      router.push(
        buildBranchPath(
          `/project/${project.id}/editor/${nodeId}`,
          project.active_branch_id
        )
      );
    },
    [project.id, project.active_branch_id, router]
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
          isWave: item.panel_type === "motion" && item.motion_type === "wave",
          isKeep: item.panel_type === "keep",
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
    buildEdges,
    buildNodes,
    initialConnections,
    initialZentaiGamen,
    setEdges,
    setNodes,
  ]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!canEditCurrentBranch) return;
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const { data, error } = await supabase
        .from("connections")
        .insert({
          project_id: project.id,
          branch_id: project.active_branch_id,
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
      setActionError(null);
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
      project.active_branch_id,
      project.id,
      setEdges,
      setNodes,
      supabase,
    ]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    async (_, edge) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", edge.id)
        .eq("branch_id", project.active_branch_id);
      if (error) {
        setActionError(error.message);
        return;
      }

      setActionError(null);
      setConnectionList((prev) => prev.filter((connection) => connection.id !== edge.id));
      setEdges((existingEdges) => existingEdges.filter((item) => item.id !== edge.id));
    },
    [canEditCurrentBranch, project.active_branch_id, setEdges, supabase]
  );

  const onNodeDragStop = useCallback(
    async (_event: unknown, node: Node) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase
        .from("zentai_gamen")
        .update({ position_x: node.position.x, position_y: node.position.y })
        .eq("id", node.id)
        .eq("branch_id", project.active_branch_id);

      if (error) {
        setActionError(error.message);
        return;
      }

      setActionError(null);
      setZentaiGamenList((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? { ...item, position_x: node.position.x, position_y: node.position.y }
            : item
        )
      );
    },
    [canEditCurrentBranch, project.active_branch_id, supabase]
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
    async (
      gridData: string,
      name: string,
      options?: {
        panelType?: PanelType;
        motionType?: MotionType | null;
        motionData?: WaveMotionData | null;
      }
    ) => {
      if (!canEditCurrentBranch) return;

      const positionX = contextMenu?.flowX ?? 0;
      const positionY = contextMenu?.flowY ?? 0;
      const panelType = options?.panelType ?? "general";
      const motionType = options?.motionType ?? null;
      const motionData = options?.motionData ?? null;

      const { data, error } = await supabase
        .from("zentai_gamen")
        .insert({
          project_id: project.id,
          branch_id: project.active_branch_id,
          name,
          grid_data: gridData,
          position_x: positionX,
          position_y: positionY,
          panel_type: panelType,
          motion_type: motionType,
          motion_data: motionData,
        })
        .select()
        .single();

      setContextMenu(null);
      if (error || !data) {
        setActionError(error?.message ?? "画面を作成できませんでした");
        return;
      }

      setActionError(null);
      router.push(
        buildBranchPath(
          `/project/${project.id}/editor/${data.id}`,
          project.active_branch_id
        )
      );
    },
    [
      canEditCurrentBranch,
      contextMenu,
      project.active_branch_id,
      project.id,
      router,
      supabase,
    ]
  );

  const handleCreateManual = useCallback(async () => {
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    await createAndNavigate(encodeGrid(emptyGrid), "Untitled");
  }, [createAndNavigate, project.grid_height, project.grid_width]);

  const handleCreateKeep = useCallback(async () => {
    const keepMask = createKeepMaskGrid(project.grid_width, project.grid_height);
    await createAndNavigate(encodeGrid(keepMask), "keep", {
      panelType: "keep",
    });
  }, [createAndNavigate, project.grid_height, project.grid_width]);

  const handleCreateWave = useCallback(async () => {
    if (!canEditCurrentBranch) return;

    const positionX = contextMenu?.flowX ?? 0;
    const positionY = contextMenu?.flowY ?? 0;
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    const beforeEncoded = encodeGrid(emptyGrid);
    const afterEncoded = encodeGrid(emptyGrid);
    const motionData = DEFAULT_WAVE_MOTION_DATA(afterEncoded);

    const { data, error } = await supabase
      .from("zentai_gamen")
      .insert({
        project_id: project.id,
        branch_id: project.active_branch_id,
        name: "ウェーブ",
        grid_data: beforeEncoded,
        position_x: positionX,
        position_y: positionY,
        panel_type: "motion",
        motion_type: "wave",
        motion_data: motionData,
      })
      .select()
      .single();

    setContextMenu(null);
    if (error || !data) {
      setActionError(error?.message ?? "ウェーブパネルを作成できませんでした");
      return;
    }

    setActionError(null);
    router.push(
      buildBranchPath(
        `/project/${project.id}/editor/${data.id}`,
        project.active_branch_id
      )
    );
  }, [
    canEditCurrentBranch,
    contextMenu,
    project.active_branch_id,
    project.grid_height,
    project.grid_width,
    project.id,
    router,
    supabase,
  ]);

  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      const template = templates.find((item) => item.id === templateId);
      if (!template) return;

      let gridData = template.grid_data;
      if (
        template.grid_width !== project.grid_width ||
        template.grid_height !== project.grid_height
      ) {
        const resizedGrid = resizeGrid(
          decodeGrid(
            template.grid_data,
            template.grid_width,
            template.grid_height
          ),
          {
            targetWidth: project.grid_width,
            targetHeight: project.grid_height,
            autoAdjustIllustration: true,
          }
        );
        gridData = encodeGrid(resizedGrid);
      }

      await createAndNavigate(gridData, `${template.name} (コピー)`);
    },
    [createAndNavigate, project.grid_height, project.grid_width, templates]
  );

  const handleSelectExisting = useCallback(
    async (zentaiGamenId: string) => {
      const existing = zentaiGamenList.find((item) => item.id === zentaiGamenId);
      if (!existing) return;
      await createAndNavigate(existing.grid_data, `${existing.name} (コピー)`, {
        panelType: existing.panel_type,
        motionType: existing.motion_type,
        motionData: existing.motion_data ? { ...existing.motion_data } : null,
      });
    },
    [createAndNavigate, zentaiGamenList]
  );

  const handleImportFile = useCallback(
    (type: "xlsx" | "csv") => {
      if (!canEditCurrentBranch) return;
      fileTypeRef.current = type;
      setContextMenu(null);
      setTimeout(() => fileInputRef.current?.click(), 100);
    },
    [canEditCurrentBranch]
  );

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
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageBase64,
            gridWidth: project.grid_width,
            gridHeight: project.grid_height,
          }),
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          setActionError(result.error ?? "スキャンに失敗しました");
          return;
        }
        const { gridData } = (await response.json()) as { gridData: string };
        await createAndNavigate(gridData, "スキャン");
      } catch {
        setActionError("スキャンに失敗しました");
      } finally {
        setScanProcessing(false);
      }
    },
    [createAndNavigate, project.grid_height, project.grid_width]
  );

  const handleDeleteNode = useCallback(async () => {
    if (!nodeMenu || !canEditCurrentBranch) return;

    const { error } = await supabase
      .from("zentai_gamen")
      .delete()
      .eq("id", nodeMenu.nodeId)
      .eq("branch_id", project.active_branch_id);
    if (error) {
      setActionError(error.message);
      return;
    }

    setActionError(null);
    setZentaiGamenList((prev) => prev.filter((item) => item.id !== nodeMenu.nodeId));
    setConnectionList((prev) =>
      prev.filter(
        (connection) =>
          connection.source_id !== nodeMenu.nodeId &&
          connection.target_id !== nodeMenu.nodeId
      )
    );
    setNodes((existingNodes) => existingNodes.filter((node) => node.id !== nodeMenu.nodeId));
    setEdges((existingEdges) =>
      existingEdges.filter(
        (edge) => edge.source !== nodeMenu.nodeId && edge.target !== nodeMenu.nodeId
      )
    );
    setNodeMenu(null);
  }, [
    canEditCurrentBranch,
    nodeMenu,
    project.active_branch_id,
    setEdges,
    setNodes,
    supabase,
  ]);

  const handleRenameNode = useCallback(
    async (newName: string) => {
      if (!nodeMenu || !canEditCurrentBranch) return;

      const { error } = await supabase
        .from("zentai_gamen")
        .update({ name: newName })
        .eq("id", nodeMenu.nodeId)
        .eq("branch_id", project.active_branch_id);
      if (error) {
        setActionError(error.message);
        return;
      }

      setActionError(null);
      setZentaiGamenList((prev) =>
        prev.map((item) =>
          item.id === nodeMenu.nodeId ? { ...item, name: newName } : item
        )
      );
      setNodes((existingNodes) =>
        existingNodes.map((node) =>
          node.id === nodeMenu.nodeId
            ? { ...node, data: { ...node.data, name: newName } }
            : node
        )
      );
    },
    [canEditCurrentBranch, nodeMenu, project.active_branch_id, setNodes, supabase]
  );

  const handlePlayFromNode = useCallback(async () => {
    if (!nodeMenu) return;

    const startId = nodeMenu.nodeId;
    setNodeMenu(null);

    const liveConnections: DBConnection[] = edges.map((edge) => ({
      id: edge.id,
      project_id: project.id,
      branch_id: project.active_branch_id,
      source_id: edge.source,
      target_id: edge.target,
      sort_order: 0,
      interval_override_ms:
        connectionList.find((connection) => connection.id === edge.id)
          ?.interval_override_ms ?? null,
      created_at: "",
    }));

    const routes = findPlaybackRoutes(
      liveConnections.length > 0 ? liveConnections : connectionList,
      startId
    );
    let route = routes[0];
    if (!route || route.length === 0) {
      route = [startId];
    }

    const timeline = buildPlaybackTimeline({
      route,
      zentaiGamen: zentaiGamenList,
      connections: connectionList,
      gridWidth: project.grid_width,
      gridHeight: project.grid_height,
      defaultPanelDurationMs: project.default_panel_duration_ms,
      defaultIntervalMs: project.default_interval_ms,
    });

    if (timeline.frameItems.length > 0) {
      setPlaybackData(timeline);
    }
  }, [
    connectionList,
    edges,
    nodeMenu,
    project.active_branch_id,
    project.default_interval_ms,
    project.default_panel_duration_ms,
    project.grid_height,
    project.grid_width,
    project.id,
    zentaiGamenList,
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
          <span className="w-4 h-0.5 bg-foreground" />
          <span className="w-4 h-0.5 bg-foreground" />
          <span className="w-4 h-0.5 bg-foreground" />
          {showGitBadge && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sky-500" />
          )}
        </button>

        <ProjectBranchSwitcher
          projectId={project.id}
          branches={branches}
          currentBranch={currentBranch}
          canCreateBranches={canCreateBranches}
          canRequestMerge={canRequestMerge}
          canMergeToMainDirectly={auth.is_admin && !currentBranch.is_main}
          canDeleteBranches={canCreateBranches}
        />

        {!canEditCurrentBranch && (
          <div className="absolute top-20 left-16 z-30 rounded-lg border border-card-border bg-card/95 px-3 py-2 text-xs text-muted shadow-sm">
            {currentBranch.is_main
              ? "main は admin のみ直接編集できます。作業ブランチから申請してください"
              : "このアカウントは閲覧専用です"}
          </div>
        )}

        {actionError && (
          <div className="absolute top-4 right-4 z-30 max-w-sm rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger shadow-sm">
            {actionError}
          </div>
        )}

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

        {contextMenu && (
          <ContextMenu
            x={contextMenu.screenX}
            y={contextMenu.screenY}
            onManual={handleCreateManual}
            onKeep={handleCreateKeep}
            onWave={handleCreateWave}
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
          branchId={project.active_branch_id}
          showGitBadge={showGitBadge}
          showGit={canViewGit}
        />
      </div>

      {playbackData && (
        <PlaybackPanel
          projectId={project.id}
          branchId={project.active_branch_id}
          timeline={playbackData}
          onClose={() => setPlaybackData(null)}
          initialMusic={currentMusic}
          onMusicChange={handleMusicChange}
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
