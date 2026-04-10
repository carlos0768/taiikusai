"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { encodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid } from "@/lib/grid/types";
import type {
  Project,
  ZentaiGamen,
  Connection as DBConnection,
  Template,
} from "@/types";
import ZentaiGamenNode from "./ZentaiGamenNode";
import ConnectionEdge from "./ConnectionEdge";
import ContextMenu, { type SubMenuItem } from "./ContextMenu";
import NodeDeleteMenu from "./NodeDeleteMenu";
import Sidebar from "./Sidebar";
import CameraCapture from "@/components/scan/CameraCapture";
import { parseExcel, parseCsv } from "@/lib/import/parseSpreadsheet";

const nodeTypes = { zentaiGamen: ZentaiGamenNode };
const edgeTypes = { connection: ConnectionEdge };

interface DashboardCanvasProps {
  project: Project;
  initialZentaiGamen: ZentaiGamen[];
  initialConnections: DBConnection[];
}

function DashboardCanvasInner({
  project,
  initialZentaiGamen,
  initialConnections,
}: DashboardCanvasProps) {
  const router = useRouter();
  const supabase = createClient();
  const reactFlowInstance = useReactFlow();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeRef = useRef<"xlsx" | "csv">("xlsx");

  // Scan state
  const [showCamera, setShowCamera] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);

  // Context menu state — store both screen pos and flow pos
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  // Node menu state (long-press on node: delete + rename)
  const [nodeMenu, setNodeMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeName: string;
  } | null>(null);

  // Long press detection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  // Load templates
  useEffect(() => {
    supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTemplates(data ?? []));
  }, []);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      router.push(`/project/${project.id}/editor/${nodeId}`);
    },
    [project.id, router]
  );

  // Node long-press callback (called from ZentaiGamenNode)
  const handleNodeLongPress = useCallback(
    (nodeId: string, nodeName: string, x: number, y: number) => {
      setNodeMenu({ x, y, nodeId, nodeName });
    },
    []
  );

  const buildNodes = useCallback(
    (zentaiGamenList: ZentaiGamen[], connections: DBConnection[]): Node[] => {
      const sourceIds = new Set(connections.map((c) => c.source_id));
      return zentaiGamenList.map((zg) => ({
        id: zg.id,
        type: "zentaiGamen",
        position: { x: zg.position_x, y: zg.position_y },
        data: {
          name: zg.name,
          gridData: zg.grid_data,
          gridWidth: project.grid_width,
          gridHeight: project.grid_height,
          hasOutgoingEdge: sourceIds.has(zg.id),
          onDoubleClick: handleNodeDoubleClick,
          onLongPress: handleNodeLongPress,
        },
      }));
    },
    [project.grid_width, project.grid_height, handleNodeDoubleClick, handleNodeLongPress]
  );

  const buildEdges = useCallback((connections: DBConnection[]): Edge[] => {
    return connections.map((conn) => ({
      id: conn.id,
      source: conn.source_id,
      target: conn.target_id,
      type: "connection",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#FFD700",
        width: 10,
        height: 10,
      },
    }));
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes(initialZentaiGamen, initialConnections)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildEdges(initialConnections)
  );

  // Connect nodes
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const { data, error } = await supabase
        .from("connections")
        .insert({
          project_id: project.id,
          source_id: connection.source,
          target_id: connection.target,
          sort_order: 0,
        })
        .select()
        .single();
      if (error) return;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: data.id,
            type: "connection",
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#FFD700",
              width: 20,
              height: 20,
            },
          },
          eds
        )
      );
      setNodes((nds) =>
        nds.map((n) =>
          n.id === connection.source
            ? { ...n, data: { ...n.data, hasOutgoingEdge: true } }
            : n
        )
      );
    },
    [project.id, supabase, setEdges, setNodes]
  );

  // Delete edge on click (tap)
  const onEdgeClick: EdgeMouseHandler = useCallback(
    async (_, edge) => {
      await supabase.from("connections").delete().eq("id", edge.id);
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [supabase, setEdges]
  );

  // Save node position on drag end
  const onNodeDragStop = useCallback(
    async (_: unknown, node: Node) => {
      await supabase
        .from("zentai_gamen")
        .update({ position_x: node.position.x, position_y: node.position.y })
        .eq("id", node.id);
    },
    [supabase]
  );

  // Long press on pane — convert screen coords to flow coords for accurate placement
  const onPanePointerDown = useCallback(
    (e: React.PointerEvent) => {
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        // Convert screen position to flow position
        const flowPos = reactFlowInstance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        setContextMenu({
          screenX: e.clientX,
          screenY: e.clientY,
          flowX: flowPos.x,
          flowY: flowPos.y,
        });
      }, 500);
    },
    [reactFlowInstance]
  );

  const onPanePointerMove = useCallback((e: React.PointerEvent) => {
    if (longPressStartRef.current) {
      const dx = e.clientX - longPressStartRef.current.x;
      const dy = e.clientY - longPressStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  }, []);

  const onPanePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  // Also support right-click context menu on desktop
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const nodeData = node.data as unknown as { name: string };
      setNodeMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodeName: nodeData.name ?? "Untitled",
      });
    },
    []
  );

  // Helper: create zentai_gamen at the flow position and navigate
  const createAndNavigate = useCallback(
    async (gridData: string, name: string) => {
      const posX = contextMenu?.flowX ?? 0;
      const posY = contextMenu?.flowY ?? 0;

      const { data, error } = await supabase
        .from("zentai_gamen")
        .insert({
          project_id: project.id,
          name,
          grid_data: gridData,
          position_x: posX,
          position_y: posY,
        })
        .select()
        .single();
      setContextMenu(null);
      if (error || !data) return;
      router.push(`/project/${project.id}/editor/${data.id}`);
    },
    [project.id, supabase, contextMenu, router]
  );

  // Manual
  const handleCreateManual = useCallback(async () => {
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    await createAndNavigate(encodeGrid(emptyGrid), "Untitled");
  }, [project, createAndNavigate]);

  // Template
  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;
      await createAndNavigate(template.grid_data, `${template.name} (コピー)`);
    },
    [templates, createAndNavigate]
  );

  // Existing
  const handleSelectExisting = useCallback(
    async (zentaiGamenId: string) => {
      const existing = initialZentaiGamen.find((z) => z.id === zentaiGamenId);
      if (!existing) return;
      await createAndNavigate(existing.grid_data, `${existing.name} (コピー)`);
    },
    [initialZentaiGamen, createAndNavigate]
  );

  // Import
  const handleImportFile = useCallback((type: "xlsx" | "csv") => {
    fileTypeRef.current = type;
    setContextMenu(null);
    setTimeout(() => fileInputRef.current?.click(), 100);
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

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
        for (let i = 0; i < cells.length; i++) {
          binary += String.fromCharCode(cells[i]);
        }
        await createAndNavigate(btoa(binary), file.name.replace(/\.\w+$/, ""));
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    },
    [project, createAndNavigate]
  );

  // Scan
  const handleScan = useCallback(() => {
    setContextMenu(null);
    setShowCamera(true);
  }, []);

  const handleScanCapture = useCallback(
    async (imageBase64: string) => {
      setShowCamera(false);
      setScanProcessing(true);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageBase64,
            gridWidth: project.grid_width,
            gridHeight: project.grid_height,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(`スキャン失敗: ${err.error}`);
          return;
        }
        const { gridData } = await res.json();
        await createAndNavigate(gridData, "スキャン");
      } catch {
        alert("スキャンに失敗しました");
      } finally {
        setScanProcessing(false);
      }
    },
    [project, createAndNavigate]
  );

  // Delete node
  const handleDeleteNode = useCallback(async () => {
    if (!nodeMenu) return;
    await supabase.from("zentai_gamen").delete().eq("id", nodeMenu.nodeId);
    setNodes((nds) => nds.filter((n) => n.id !== nodeMenu.nodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== nodeMenu.nodeId && e.target !== nodeMenu.nodeId
      )
    );
    setNodeMenu(null);
  }, [nodeMenu, supabase, setNodes, setEdges]);

  // Rename node
  const handleRenameNode = useCallback(
    async (newName: string) => {
      if (!nodeMenu) return;
      await supabase
        .from("zentai_gamen")
        .update({ name: newName })
        .eq("id", nodeMenu.nodeId);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeMenu.nodeId
            ? { ...n, data: { ...n.data, name: newName } }
            : n
        )
      );
    },
    [nodeMenu, supabase, setNodes]
  );

  // Build submenu items
  const templateMenuItems: SubMenuItem[] = templates.map((t) => ({
    id: t.id,
    label: t.name,
  }));
  const existingMenuItems: SubMenuItem[] = initialZentaiGamen.map((z) => ({
    id: z.id,
    label: z.name,
  }));

  return (
    <div className="h-full w-full relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute top-4 left-4 z-30 w-10 h-10 flex flex-col items-center justify-center gap-1 bg-card border border-card-border rounded-lg hover:border-accent/50 transition-colors"
        aria-label="メニュー"
      >
        <span className="w-4 h-0.5 bg-foreground" />
        <span className="w-4 h-0.5 bg-foreground" />
        <span className="w-4 h-0.5 bg-foreground" />
      </button>

      {/* Scan processing overlay */}
      {scanProcessing && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-foreground">スキャン中...</p>
          </div>
        </div>
      )}

      {/* React Flow */}
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
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          proOptions={{ hideAttribution: true }}
          connectionRadius={80}
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

      {/* Context menu */}
      {contextMenu && (
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

      {/* Node menu (delete + rename) */}
      {nodeMenu && (
        <NodeDeleteMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          nodeName={nodeMenu.nodeName}
          onDelete={handleDeleteNode}
          onRename={handleRenameNode}
          onClose={() => setNodeMenu(null)}
        />
      )}

      {/* Camera */}
      {showCamera && (
        <CameraCapture
          onCapture={handleScanCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        projectId={project.id}
        projectName={project.name}
      />
    </div>
  );
}

// Wrap with ReactFlowProvider so useReactFlow works
export default function DashboardCanvas(props: DashboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <DashboardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
