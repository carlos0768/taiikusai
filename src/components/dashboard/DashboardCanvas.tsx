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
  type Viewport as FlowViewport,
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
  zentaiGamenToPlaybackFrame,
  type PlaybackTimeline,
} from "@/lib/playback/frameBuilder";
import {
  createEmptyGrid,
  getPlaybackFrameFinalGrid,
  type GridData,
} from "@/lib/grid/types";
import {
  buildDefaultKeepMask,
  createKeepMaskGrid,
  decodeKeepMask,
  encodeKeepMask,
} from "@/lib/keep";
import { resizeGrid } from "@/lib/grid/resize";
import { DEFAULT_WAVE_MOTION_DATA } from "@/types";
import CameraCapture from "@/components/scan/CameraCapture";
import ZentaiGamenNode from "./ZentaiGamenNode";
import GroupNode, { type GroupNodeData } from "./GroupNode";
import ConnectionEdge from "./ConnectionEdge";
import ContextMenu, { type SubMenuItem } from "./ContextMenu";
import KeepConnectionEditor from "./KeepConnectionEditor";
import NodeDeleteMenu from "./NodeDeleteMenu";
import Sidebar from "./Sidebar";
import PlaybackPanel from "./PlaybackPanel";
import ProjectBranchSwitcher from "./ProjectBranchSwitcher";

interface CollapsedGroup {
  id: string;
  nodeIds: string[];
  position: { x: number; y: number };
  name: string;
}

const nodeTypes = { zentaiGamen: ZentaiGamenNode, groupNode: GroupNode };
const edgeTypes = { connection: ConnectionEdge };
const DASHBOARD_VIEWPORT_STORAGE_PREFIX = "taiikusai:dashboardViewport";

interface DashboardCanvasProps {
  project: BranchScopedProject;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  initialZentaiGamen: ZentaiGamen[];
  initialConnections: DBConnection[];
  auth: AuthProfile;
  unreadGitNotifications: number;
}

function getDashboardViewportStorageKey(projectId: string, branchId: string): string {
  return `${DASHBOARD_VIEWPORT_STORAGE_PREFIX}:${projectId}:${branchId}`;
}

function isFlowViewport(value: unknown): value is FlowViewport {
  if (!value || typeof value !== "object") return false;

  const viewport = value as Partial<FlowViewport>;
  return (
    typeof viewport.x === "number" &&
    Number.isFinite(viewport.x) &&
    typeof viewport.y === "number" &&
    Number.isFinite(viewport.y) &&
    typeof viewport.zoom === "number" &&
    Number.isFinite(viewport.zoom)
  );
}

function readStoredDashboardViewport(storageKey: string): FlowViewport | null {
  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isFlowViewport(parsedValue)) return null;

    return {
      x: parsedValue.x,
      y: parsedValue.y,
      zoom: Math.max(0.1, Math.min(3, parsedValue.zoom)),
    };
  } catch {
    return null;
  }
}

function writeStoredDashboardViewport(
  storageKey: string,
  viewport: FlowViewport
): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(viewport));
  } catch {
    // Viewport persistence is only a convenience; ignore unavailable storage.
  }
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

function countKeepCells(
  encodedMask: string | null,
  gridWidth: number,
  gridHeight: number
): number {
  const mask = decodeKeepMask(encodedMask, gridWidth, gridHeight);
  if (!mask) return 0;

  let count = 0;
  for (let index = 0; index < mask.cells.length; index += 1) {
    if (mask.cells[index] === 1) count += 1;
  }
  return count;
}

function buildKeepRangeEdgeKeys(path: string[] | null): Set<string> {
  const keys = new Set<string>();
  if (!path) return keys;

  for (let index = 0; index < path.length - 1; index += 1) {
    keys.add(`${path[index]}:${path[index + 1]}`);
  }
  return keys;
}

function isReactFlowItemEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      ".react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__controls"
    )
  );
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
  const viewportStorageKey = useMemo(
    () => getDashboardViewportStorageKey(project.id, project.active_branch_id),
    [project.active_branch_id, project.id]
  );
  const suppressViewportPersistenceRef = useRef(true);

  const canEditCurrentBranch = useMemo(() => {
    if (auth.is_admin) return true;
    if (currentBranch.is_main) return false;
    return (
      (auth.permissions.can_edit_branch_content ||
        auth.permissions.can_create_branches) &&
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
  const isOwnCurrentBranch = currentBranch.created_by === auth.id;
  const canRequestMerge =
    !currentBranch.is_main &&
    (auth.is_admin ||
      (auth.permissions.can_request_main_merge && isOwnCurrentBranch));
  const canDeleteCurrentBranch =
    auth.is_admin ||
    (!currentBranch.is_main &&
      auth.permissions.can_create_branches &&
      isOwnCurrentBranch);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    connectionId: string;
  } | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedGroup[]>([]);

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

  useEffect(() => {
    supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, [supabase]);

  const getZentaiGamenDisplayGrid = useCallback(
    (zg: ZentaiGamen): GridData =>
      getPlaybackFrameFinalGrid(
        zentaiGamenToPlaybackFrame({
          zentaiGamen: zg,
          gridWidth: project.grid_width,
          gridHeight: project.grid_height,
          defaultPanelDurationMs: project.default_panel_duration_ms,
        })
      ),
    [
      project.default_panel_duration_ms,
      project.grid_height,
      project.grid_width,
    ]
  );

  const persistConnectionKeepMask = useCallback(
    async (connectionId: string, mask: GridData) => {
      const encodedMask = encodeKeepMask(mask);
      const { error } = await supabase
        .from("connections")
        .update({ keep_mask_grid_data: encodedMask })
        .eq("id", connectionId)
        .eq("branch_id", project.active_branch_id);

      if (error) throw error;

      setConnectionList((prev) =>
        prev.map((connection) =>
          connection.id === connectionId
            ? { ...connection, keep_mask_grid_data: encodedMask }
            : connection
        )
      );
    },
    [project.active_branch_id, supabase]
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

            const sourceGrid = getZentaiGamenDisplayGrid(source);
            const targetGrid = getZentaiGamenDisplayGrid(target);
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

      writeStoredDashboardViewport(
        viewportStorageKey,
        reactFlowInstance.getViewport()
      );
      router.push(
        buildBranchPath(
          `/project/${project.id}/editor/${nodeId}`,
          project.active_branch_id
        )
      );
    },
    [
      canEditCurrentBranch,
      connectionList,
      getZentaiGamenDisplayGrid,
      keepRangeStart,
      persistConnectionKeepMask,
      project.active_branch_id,
      project.id,
      reactFlowInstance,
      router,
      viewportStorageKey,
      zentaiGamenList,
    ]
  );

  const handleNodeLongPress = useCallback(
    (nodeId: string, nodeName: string, x: number, y: number) => {
      if (keepRangeStart) return;
      if (multiSelectMode) return;
      setContextMenu(null);
      setEdgeMenu(null);
      setNodeMenu({ x, y, nodeId, nodeName });
    },
    [keepRangeStart, multiSelectMode]
  );

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleGroupExpand = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const handleEnterMultiSelect = useCallback(() => {
    if (!nodeMenu) return;
    setMultiSelectMode(true);
    setSelectedNodeIds(new Set([nodeMenu.nodeId]));
    setNodeMenu(null);
  }, [nodeMenu]);

  const handleCollapseSelected = useCallback(() => {
    if (selectedNodeIds.size < 1) return;
    const ids = Array.from(selectedNodeIds);

    // Compute centroid position from current node positions
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    ids.forEach((nid) => {
      const zg = zentaiGamenList.find((item) => item.id === nid);
      if (zg) {
        sumX += zg.position_x;
        sumY += zg.position_y;
        count += 1;
      }
    });
    const position = count > 0
      ? { x: sumX / count, y: sumY / count }
      : { x: 0, y: 0 };

    const firstZg = zentaiGamenList.find((item) => item.id === ids[0]);
    const name = firstZg
      ? ids.length > 1
        ? `${firstZg.name} 他${ids.length - 1}枚`
        : firstZg.name
      : `${ids.length}枚のパネル`;

    const groupId = `group-${Date.now()}`;
    setCollapsedGroups((prev) => [...prev, { id: groupId, nodeIds: ids, position, name }]);
    setMultiSelectMode(false);
    setSelectedNodeIds(new Set());
  }, [selectedNodeIds, zentaiGamenList]);

  const buildNodes = useCallback(
    (nextZentaiGamen: ZentaiGamen[], nextConnections: DBConnection[]): Node[] => {
      const groupedNodeIds = new Set(collapsedGroups.flatMap((g) => g.nodeIds));
      const nodeIdToGroup = new Map<string, CollapsedGroup>();
      collapsedGroups.forEach((g) => g.nodeIds.forEach((nid) => nodeIdToGroup.set(nid, g)));

      const sourceIds = new Set(nextConnections.map((connection) => connection.source_id));

      // Regular (non-grouped) zentai-gamen nodes
      const regularNodes: Node[] = nextZentaiGamen
        .filter((item) => !groupedNodeIds.has(item.id))
        .map((item) => ({
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
            isKeepRangeSelected: keepRangePath?.includes(item.id) ?? false,
            isKeepRangeStart: keepRangeStart?.nodeId === item.id,
            isMultiSelectMode: multiSelectMode,
            isSelected: selectedNodeIds.has(item.id),
            onDoubleClick: handleNodeDoubleClick,
            onLongPress: handleNodeLongPress,
            onSelect: handleNodeSelect,
          },
        }));

      // Group nodes for collapsed groups
      const groupNodes: Node[] = collapsedGroups.map((group) => {
        const firstZg = nextZentaiGamen.find((zg) => group.nodeIds.includes(zg.id));
        const hasOutgoingEdge = nextConnections.some(
          (conn) =>
            group.nodeIds.includes(conn.source_id) &&
            !group.nodeIds.includes(conn.target_id)
        );
        const groupData: GroupNodeData = {
          name: group.name,
          nodeCount: group.nodeIds.length,
          gridData: firstZg?.grid_data ?? "",
          gridWidth: project.grid_width,
          gridHeight: project.grid_height,
          hasOutgoingEdge,
          onExpand: handleGroupExpand,
        };
        return {
          id: group.id,
          type: "groupNode",
          position: group.position,
          data: groupData,
        };
      });

      return [...regularNodes, ...groupNodes];
    },
    [
      collapsedGroups,
      handleNodeDoubleClick,
      handleNodeLongPress,
      handleNodeSelect,
      handleGroupExpand,
      keepRangePath,
      keepRangeStart,
      multiSelectMode,
      selectedNodeIds,
      project.grid_height,
      project.grid_width,
    ]
  );

  const buildEdges = useCallback(
    (nextConnections: DBConnection[]): Edge[] => {
      if (collapsedGroups.length === 0) {
        return buildConnectionEdges(nextConnections);
      }

      const nodeIdToGroup = new Map<string, CollapsedGroup>();
      collapsedGroups.forEach((g) => g.nodeIds.forEach((nid) => nodeIdToGroup.set(nid, g)));

      const getVirtualId = (realId: string) => nodeIdToGroup.get(realId)?.id ?? realId;
      const edgeMap = new Map<string, Edge>();

      nextConnections.forEach((conn) => {
        const srcId = getVirtualId(conn.source_id);
        const tgtId = getVirtualId(conn.target_id);
        if (srcId === tgtId) return; // intra-group connection — hide it
        const key = `${srcId}:${tgtId}`;
        if (edgeMap.has(key)) return; // deduplicate parallel virtual edges
        edgeMap.set(key, {
          id: `${conn.id}-v`,
          source: srcId,
          target: tgtId,
          type: "connection",
          markerEnd: undefined,
          data: {},
        });
      });

      return Array.from(edgeMap.values());
    },
    [collapsedGroups]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes(initialZentaiGamen, initialConnections)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildEdges(initialConnections)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZentaiGamenList(initialZentaiGamen);
    setConnectionList(initialConnections);
    setNodes(buildNodes(initialZentaiGamen, initialConnections));
    setEdges(buildEdges(initialConnections));
    // Sync only when server-provided project data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialConnections,
    initialZentaiGamen,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    const selectedRangeIds = new Set(
      keepRangePath ?? (keepRangeStart ? [keepRangeStart.nodeId] : [])
    );
    const startId = keepRangeStart?.nodeId ?? null;

    setNodes((existingNodes) =>
      existingNodes.map((node) => {
        if (node.type === "groupNode") return node;
        return {
          ...node,
          data: {
            ...node.data,
            isKeepRangeSelected: selectedRangeIds.has(node.id),
            isKeepRangeStart: node.id === startId,
            isMultiSelectMode: multiSelectMode,
            isSelected: selectedNodeIds.has(node.id),
            onDoubleClick: handleNodeDoubleClick,
            onLongPress: handleNodeLongPress,
            onSelect: handleNodeSelect,
          },
        };
      })
    );
  }, [
    handleNodeDoubleClick,
    handleNodeLongPress,
    handleNodeSelect,
    keepRangePath,
    keepRangeStart,
    multiSelectMode,
    selectedNodeIds,
    setNodes,
  ]);

  // Rebuild nodes/edges whenever collapsed groups change
  useEffect(() => {
    setNodes(buildNodes(zentaiGamenList, connectionList));
    setEdges(buildEdges(connectionList));
  }, [
    collapsedGroups,
    buildNodes,
    buildEdges,
    zentaiGamenList,
    connectionList,
    setNodes,
    setEdges,
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

  const handleEdgeClick = useCallback(
    async (edgeId: string) => {
      if (!canEditCurrentBranch) return;

      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", edgeId)
        .eq("branch_id", project.active_branch_id);
      if (error) {
        setActionError(error.message);
        return;
      }

      const nextConnections = connectionList.filter(
        (connection) => connection.id !== edgeId
      );
      const sourceIds = new Set(
        nextConnections.map((connection) => connection.source_id)
      );

      setActionError(null);
      setEdgeMenu(null);
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
      project.active_branch_id,
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

  const onNodeDragStop = useCallback(
    async (_event: unknown, node: Node) => {
      // Group nodes are ephemeral — just update local state
      if (node.type === "groupNode") {
        setCollapsedGroups((prev) =>
          prev.map((g) => (g.id === node.id ? { ...g, position: node.position } : g))
        );
        return;
      }

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
      if (isReactFlowItemEventTarget(event.target)) {
        return;
      }

      if (multiSelectMode) {
        setMultiSelectMode(false);
        setSelectedNodeIds(new Set());
        return;
      }
      if (!canEditCurrentBranch) return;
      if (keepRangeStart) return;

      longPressStartRef.current = { x: event.clientX, y: event.clientY };
      longPressTimerRef.current = setTimeout(() => {
        setNodeMenu(null);
        setEdgeMenu(null);
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
    [canEditCurrentBranch, keepRangeStart, multiSelectMode, reactFlowInstance]
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
      setEdgeMenu(null);
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
      writeStoredDashboardViewport(
        viewportStorageKey,
        reactFlowInstance.getViewport()
      );
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
      reactFlowInstance,
      router,
      supabase,
      viewportStorageKey,
    ]
  );

  const handleCreateManual = useCallback(async () => {
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    await createAndNavigate(encodeGrid(emptyGrid), "Untitled");
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
      const panelType: PanelType =
        existing.panel_type === "keep" ? "general" : existing.panel_type;
      await createAndNavigate(existing.grid_data, `${existing.name} (コピー)`, {
        panelType,
        motionType: panelType === "motion" ? existing.motion_type : null,
        motionData:
          panelType === "motion" && existing.motion_data
            ? { ...existing.motion_data }
            : null,
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

  const handleStartKeepRange = useCallback(() => {
    if (!nodeMenu || !canEditCurrentBranch) return;

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

      const sourceGrid = getZentaiGamenDisplayGrid(source);
      const targetGrid = getZentaiGamenDisplayGrid(target);
      const existingMask = decodeKeepMask(
        connection.keep_mask_grid_data,
        project.grid_width,
        project.grid_height
      );
      const mask =
        existingMask ?? createKeepMaskGrid(project.grid_width, project.grid_height);

      setKeepEditor({
        connectionId: connection.id,
        sourceName: source.name,
        targetName: target.name,
        sourceGrid,
        targetGrid,
        mask,
      });
      setActionError(null);
      setEdgeMenu(null);
    },
    [
      connectionList,
      getZentaiGamenDisplayGrid,
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

  useEffect(() => {
    const selectedEdgeKeys = buildKeepRangeEdgeKeys(keepRangePath);
    const connectionById = new Map(
      connectionList.map((connection) => [connection.id, connection])
    );

    setEdges((existingEdges) =>
      existingEdges.map((edge) => {
        const connection = connectionById.get(edge.id);
        const keepCount = countKeepCells(
          connection?.keep_mask_grid_data ?? null,
          project.grid_width,
          project.grid_height
        );

        return {
          ...edge,
          data: {
            ...edge.data,
            canEdit: canEditCurrentBranch,
            hasKeep: keepCount > 0,
            keepCount,
            isKeepRangeSelected: selectedEdgeKeys.has(`${edge.source}:${edge.target}`),
            onClick: handleEdgeClick,
            onLongPress: handleEdgeLongPress,
            onOpenKeepEditor: handleOpenKeepEditor,
          },
        };
      })
    );
  }, [
    canEditCurrentBranch,
    connectionList,
    handleEdgeClick,
    handleEdgeLongPress,
    handleOpenKeepEditor,
    keepRangePath,
    project.grid_height,
    project.grid_width,
    setEdges,
  ]);

  const handleDisableConnectionKeep = useCallback(
    async (connectionId: string) => {
      if (!canEditCurrentBranch) return;

      try {
        await persistConnectionKeepMask(
          connectionId,
          createKeepMaskGrid(project.grid_width, project.grid_height)
        );
        setActionError(null);
        setEdgeMenu(null);
        if (keepEditor?.connectionId === connectionId) {
          setKeepEditor(null);
        }
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "keep表示の無効化に失敗しました"
        );
      }
    },
    [
      canEditCurrentBranch,
      keepEditor,
      persistConnectionKeepMask,
      project.grid_height,
      project.grid_width,
    ]
  );

  const handlePlayFromNode = useCallback(async () => {
    if (!nodeMenu) return;

    const startId = nodeMenu.nodeId;
    setNodeMenu(null);

    const liveConnections: DBConnection[] = edges.map((edge) => ({
      ...(connectionList.find((connection) => connection.id === edge.id) ?? {}),
      id: edge.id,
      project_id: project.id,
      branch_id: project.active_branch_id,
      source_id: edge.source,
      target_id: edge.target,
      sort_order: 0,
      interval_override_ms:
        connectionList.find((connection) => connection.id === edge.id)
          ?.interval_override_ms ?? null,
      keep_mask_grid_data:
        connectionList.find((connection) => connection.id === edge.id)
          ?.keep_mask_grid_data ?? null,
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

  const handleReactFlowInit = useCallback(() => {
    const storedViewport = readStoredDashboardViewport(viewportStorageKey);
    if (!storedViewport) {
      suppressViewportPersistenceRef.current = false;
      return;
    }

    void reactFlowInstance.setViewport(storedViewport, { duration: 0 });
    window.setTimeout(() => {
      suppressViewportPersistenceRef.current = false;
    }, 0);
  }, [reactFlowInstance, viewportStorageKey]);

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: FlowViewport) => {
      if (suppressViewportPersistenceRef.current) return;
      writeStoredDashboardViewport(viewportStorageKey, viewport);
    },
    [viewportStorageKey]
  );

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
          canDeleteBranches={canDeleteCurrentBranch}
        />

        {!canEditCurrentBranch && (
          <div className="absolute top-20 left-16 z-30 rounded-lg border border-card-border bg-card/95 px-3 py-2 text-xs text-muted shadow-sm">
            {currentBranch.is_main
              ? "main は admin のみ直接編集できます。作業ブランチから申請してください"
              : currentBranch.created_by && currentBranch.created_by !== auth.id
                ? "他アカウントが作成したブランチは編集できません"
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

        {multiSelectMode && (
          <div className="absolute left-16 right-4 top-36 z-30 rounded-xl border border-accent/50 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  複数選択中: {selectedNodeIds.size}枚選択済み
                </p>
                <p className="text-xs text-muted">
                  パネルをタップして選択・解除できます
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCollapseSelected}
                  disabled={selectedNodeIds.size < 1}
                  className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  折りたたむ
                </button>
                <button
                  onClick={() => {
                    setMultiSelectMode(false);
                    setSelectedNodeIds(new Set());
                  }}
                  className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted hover:text-foreground"
                >
                  キャンセル
                </button>
              </div>
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
            onInit={handleReactFlowInit}
            onMoveEnd={handleMoveEnd}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={canEditCurrentBranch || collapsedGroups.length > 0}
            nodesConnectable={canEditCurrentBranch && !keepRangeStart}
            deleteKeyCode={null}
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
            onKeep={handleStartKeepRange}
            onMultiSelect={handleEnterMultiSelect}
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
            {canEditCurrentBranch && (
              <button
                onClick={() =>
                  void handleDisableConnectionKeep(edgeMenu.connectionId)
                }
                className="w-full px-4 py-2.5 text-left text-sm text-danger transition-colors hover:bg-danger/10"
              >
                この間隔のkeepをOFF
              </button>
            )}
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
