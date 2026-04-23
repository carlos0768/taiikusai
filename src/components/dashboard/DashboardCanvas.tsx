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
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { encodeGrid, decodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid, type GridData } from "@/lib/grid/types";
import {
  buildDefaultKeepMask,
  decodeKeepMask,
  encodeKeepMask,
} from "@/lib/keep";
import { buildPlaybackFrames } from "@/lib/playback/buildPlaybackFrames";
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
import KeepConnectionEditor from "./KeepConnectionEditor";
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

function findConnectionPath(
  connections: DBConnection[],
  startId: string,
  targetId: string
): string[] | null {
  function findPaths(sourceId: string, destinationId: string): string[][] {
    const adjacency = new Map<string, string[]>();
    connections.forEach((connection) => {
      const targets = adjacency.get(connection.source_id) ?? [];
      targets.push(connection.target_id);
      adjacency.set(connection.source_id, targets);
    });

    const paths: string[][] = [];
    function dfs(currentId: string, path: string[], visited: Set<string>) {
      if (paths.length > 1) return;
      if (currentId === destinationId) {
        paths.push([...path]);
        return;
      }

      const targets = adjacency.get(currentId) ?? [];
      targets.forEach((nextId) => {
        if (visited.has(nextId)) return;
        visited.add(nextId);
        path.push(nextId);
        dfs(nextId, path, visited);
        path.pop();
        visited.delete(nextId);
      });
    }

    dfs(sourceId, [sourceId], new Set([sourceId]));
    return paths;
  }

  const forwardPaths = findPaths(startId, targetId);
  if (forwardPaths.length === 1) return forwardPaths[0];
  if (forwardPaths.length > 1) {
    throw new Error("keep範囲の経路が複数あります。分岐を減らしてから選択してください");
  }

  const reversePaths = findPaths(targetId, startId);
  if (reversePaths.length === 1) return reversePaths[0];
  if (reversePaths.length > 1) {
    throw new Error("keep範囲の経路が複数あります。分岐を減らしてから選択してください");
  }

  return null;
}

function buildConnectionEdges(
  connections: DBConnection[],
  data?: Edge["data"]
): Edge[] {
  return connections.map((connection) => ({
    id: connection.id,
    source: connection.source_id,
    target: connection.target_id,
    type: "connection",
    markerEnd: undefined,
    data,
  }));
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
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    connectionId: string;
  } | null>(null);
  const [keepRangeStart, setKeepRangeStart] = useState<{
    nodeId: string;
    nodeName: string;
  } | null>(null);
  const [keepRangePath, setKeepRangePath] = useState<string[] | null>(null);
  const [keepEditor, setKeepEditor] = useState<{
    connectionId: string;
    sourceName: string;
    targetName: string;
    sourceGrid: GridData;
    targetGrid: GridData;
    mask: GridData;
  } | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const persistConnectionKeepMask = useCallback(
    async (connectionId: string, mask: GridData) => {
      const encodedMask = encodeKeepMask(mask);
      const { error } = await supabase
        .from("connections")
        .update({ keep_mask_grid_data: encodedMask })
        .eq("id", connectionId);

      if (error) {
        throw error;
      }

      setConnectionList((prev) =>
        prev.map((connection) =>
          connection.id === connectionId
            ? { ...connection, keep_mask_grid_data: encodedMask }
            : connection
        )
      );
    },
    [supabase]
  );

  const handleNodeDoubleClick = useCallback(
    async (nodeId: string) => {
      if (keepRangeStart) {
        if (!canEditCurrentBranch) return;
        if (nodeId === keepRangeStart.nodeId) {
          setActionError("keep範囲の終了パネルを選択してください");
          return;
        }

        try {
          const path = findConnectionPath(
            connectionList,
            keepRangeStart.nodeId,
            nodeId
          );
          if (!path || path.length < 2) {
            setActionError("選択したパネル間に連続した接続経路がありません");
            return;
          }

          setKeepRangePath(path);

          const zentaiGamenMap = new Map(
            zentaiGamenList.map((item) => [item.id, item])
          );
          const connectionMap = new Map(
            connectionList.map((connection) => [
              `${connection.source_id}:${connection.target_id}`,
              connection,
            ])
          );

          for (let index = 0; index < path.length - 1; index += 1) {
            const sourceId = path[index];
            const targetId = path[index + 1];
            const source = zentaiGamenMap.get(sourceId);
            const target = zentaiGamenMap.get(targetId);
            const connection = connectionMap.get(`${sourceId}:${targetId}`);

            if (!source || !target || !connection) {
              throw new Error("keep範囲内の接続データを解決できませんでした");
            }

            const sourceGrid = decodeGrid(
              source.grid_data,
              project.grid_width,
              project.grid_height
            );
            const targetGrid = decodeGrid(
              target.grid_data,
              project.grid_width,
              project.grid_height
            );
            await persistConnectionKeepMask(
              connection.id,
              buildDefaultKeepMask(sourceGrid, targetGrid)
            );
          }

          setActionError(null);
          setKeepRangeStart(null);
          window.setTimeout(() => setKeepRangePath(null), 1200);
        } catch (error) {
          setActionError(
            error instanceof Error ? error.message : "keep範囲の作成に失敗しました"
          );
        }
        return;
      }

      router.push(`/project/${project.id}/editor/${nodeId}${currentBranchQuery}`);
    },
    [
      canEditCurrentBranch,
      connectionList,
      currentBranchQuery,
      keepRangeStart,
      persistConnectionKeepMask,
      project.grid_height,
      project.grid_width,
      project.id,
      router,
      zentaiGamenList,
    ]
  );

  const handleNodeLongPress = useCallback(
    (nodeId: string, nodeName: string, x: number, y: number) => {
      if (keepRangeStart) return;
      setContextMenu(null);
      setEdgeMenu(null);
      setNodeMenu({ x, y, nodeId, nodeName });
    },
    [keepRangeStart]
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

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes(initialZentaiGamen, initialConnections)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildConnectionEdges(initialConnections)
  );

  const handleEdgeClick = useCallback(
    async (edgeId: string) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase.from("connections").delete().eq("id", edgeId);
      if (error) {
        setActionError(error.message);
        return;
      }

      const nextConnections = connectionList.filter(
        (connection) => connection.id !== edgeId
      );
      const sourceIds = new Set(nextConnections.map((connection) => connection.source_id));

      setConnectionList(nextConnections);
      setEdges((existingEdges) => existingEdges.filter((item) => item.id !== edgeId));
      setNodes((existingNodes) =>
        existingNodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            hasOutgoingEdge: sourceIds.has(node.id),
          },
        }))
      );
    },
    [
      canEditCurrentBranch,
      connectionList,
      setEdges,
      setNodes,
      supabase,
    ]
  );

  const handleEdgeLongPress = useCallback(
    (edgeId: string, x: number, y: number) => {
      if (!canEditCurrentBranch) return;
      setContextMenu(null);
      setNodeMenu(null);
      setEdgeMenu({ x, y, connectionId: edgeId });
    },
    [canEditCurrentBranch]
  );

  const buildEdges = useCallback(
    (nextConnections: DBConnection[]): Edge[] =>
      buildConnectionEdges(nextConnections, {
        onClick: handleEdgeClick,
        onLongPress: handleEdgeLongPress,
      }),
    [handleEdgeClick, handleEdgeLongPress]
  );

  useEffect(() => {
    setZentaiGamenList(initialZentaiGamen);
    setConnectionList(initialConnections);
    setNodes(buildNodes(initialZentaiGamen, initialConnections));
    setEdges(buildEdges(initialConnections));
  }, [
    initialConnections,
    initialZentaiGamen,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    const selectedIds = new Set(
      keepRangePath ?? (keepRangeStart ? [keepRangeStart.nodeId] : [])
    );
    const startId = keepRangeStart?.nodeId ?? null;

    setNodes((existingNodes) =>
      existingNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isKeepRangeSelected: selectedIds.has(node.id),
          isKeepRangeStart: node.id === startId,
        },
      }))
    );
  }, [keepRangePath, keepRangeStart, setNodes]);

  useEffect(() => {
    setNodes((existingNodes) =>
      existingNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onDoubleClick: handleNodeDoubleClick,
          onLongPress: handleNodeLongPress,
        },
      }))
    );
  }, [handleNodeDoubleClick, handleNodeLongPress, setNodes]);

  useEffect(() => {
    setEdges((existingEdges) =>
      existingEdges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          onClick: handleEdgeClick,
          onLongPress: handleEdgeLongPress,
        },
      }))
    );
  }, [handleEdgeClick, handleEdgeLongPress, setEdges]);

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
            data: {
              onClick: handleEdgeClick,
              onLongPress: handleEdgeLongPress,
            },
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
      handleEdgeClick,
      handleEdgeLongPress,
      project.id,
      setEdges,
      setNodes,
      supabase,
    ]
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
      if (keepRangeStart) return;

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
    [canEditCurrentBranch, keepRangeStart, reactFlowInstance]
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
      if (keepRangeStart) return;
      const nodeData = node.data as { name?: string };
      setNodeMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodeName: nodeData.name ?? "Untitled",
      });
    },
    [keepRangeStart]
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

  const handleStartKeepRange = useCallback(() => {
    if (!canEditCurrentBranch || !nodeMenu) return;

    setKeepRangeStart({
      nodeId: nodeMenu.nodeId,
      nodeName: nodeMenu.nodeName,
    });
    setKeepRangePath([nodeMenu.nodeId]);
    setActionError(null);
    setEdgeMenu(null);
    setNodeMenu(null);
  }, [canEditCurrentBranch, nodeMenu]);

  const handleOpenKeepEditor = useCallback(
    async (connectionId: string) => {
      const connection = connectionList.find((item) => item.id === connectionId);
      if (!connection) {
        setActionError("接続が見つかりません");
        return;
      }

      const source = zentaiGamenList.find((item) => item.id === connection.source_id);
      const target = zentaiGamenList.find((item) => item.id === connection.target_id);
      if (!source || !target) {
        setActionError("接続先のパネルが見つかりません");
        return;
      }

      const sourceGrid = decodeGrid(
        source.grid_data,
        project.grid_width,
        project.grid_height
      );
      const targetGrid = decodeGrid(
        target.grid_data,
        project.grid_width,
        project.grid_height
      );
      const existingMask = decodeKeepMask(
        connection.keep_mask_grid_data,
        project.grid_width,
        project.grid_height
      );
      const mask = existingMask ?? buildDefaultKeepMask(sourceGrid, targetGrid);

      if (!existingMask && canEditCurrentBranch) {
        try {
          await persistConnectionKeepMask(connection.id, mask);
        } catch (error) {
          setActionError(
            error instanceof Error ? error.message : "keep表示の初期化に失敗しました"
          );
          return;
        }
      }

      setKeepEditor({
        connectionId: connection.id,
        sourceName: source.name,
        targetName: target.name,
        sourceGrid,
        targetGrid,
        mask,
      });
      setEdgeMenu(null);
    },
    [
      canEditCurrentBranch,
      connectionList,
      persistConnectionKeepMask,
      project.grid_height,
      project.grid_width,
      zentaiGamenList,
    ]
  );

  const handleSaveKeepEditor = useCallback(
    async (mask: GridData) => {
      if (!keepEditor) return;
      try {
        await persistConnectionKeepMask(keepEditor.connectionId, mask);
        setActionError(null);
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "keep表示の保存に失敗しました"
        );
        throw error;
      }
    },
    [keepEditor, persistConnectionKeepMask]
  );

  const handlePlayFromNode = useCallback(() => {
    if (!nodeMenu) return;

    const routes = findPlaybackRoutes(connectionList, nodeMenu.nodeId);
    const route = routes[0];
    if (!route || route.length === 0) {
      setActionError("再生できるルートがありません");
      return;
    }

    const { frames, frameNames } = buildPlaybackFrames(
      route,
      zentaiGamenList,
      connectionList,
      project.grid_width,
      project.grid_height
    );

    if (frames.length > 0) {
      setPlaybackData({ frames, frameNames });
      setNodeMenu(null);
    }
  }, [connectionList, nodeMenu, project.grid_height, project.grid_width, zentaiGamenList]);

  const handleSwitchBranch = useCallback(
    (nextBranchName: string) => {
      router.push(`/project/${project.id}${branchQuery(nextBranchName)}`);
      router.refresh();
    },
    [project.id, router]
  );

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

        {keepRangeStart && (
          <div className="absolute left-16 right-4 top-36 z-30 rounded-xl border border-accent/50 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  keep範囲選択中: {keepRangeStart.nodeName}
                </p>
                <p className="text-xs text-muted">
                  終了パネルをタップすると、接続順の範囲を自動選択して同色セルを keep ON にします
                </p>
              </div>
              <button
                onClick={() => {
                  setKeepRangeStart(null);
                  setKeepRangePath(null);
                }}
                className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground"
              >
                キャンセル
              </button>
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
            onKeep={handleStartKeepRange}
            onClose={() => setNodeMenu(null)}
            canEdit={canEditCurrentBranch}
          />
        )}

        {edgeMenu && (
          <div
            className="fixed z-50 min-w-[140px] rounded-lg border border-card-border bg-card py-1 shadow-xl"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
          >
            <button
              onClick={() => void handleOpenKeepEditor(edgeMenu.connectionId)}
              className="w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent/10"
            >
              keep表示
            </button>
            <button
              onClick={() => setEdgeMenu(null)}
              className="w-full px-4 py-2 text-left text-xs text-muted transition-colors hover:bg-background"
            >
              閉じる
            </button>
          </div>
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

      {keepEditor && (
        <KeepConnectionEditor
          sourceName={keepEditor.sourceName}
          targetName={keepEditor.targetName}
          sourceGrid={keepEditor.sourceGrid}
          targetGrid={keepEditor.targetGrid}
          initialMask={keepEditor.mask}
          canEdit={canEditCurrentBranch}
          onSave={handleSaveKeepEditor}
          onClose={() => setKeepEditor(null)}
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
