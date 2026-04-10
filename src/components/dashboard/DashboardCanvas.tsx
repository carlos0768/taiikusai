"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
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

export default function DashboardCanvas({
  project,
  initialZentaiGamen,
  initialConnections,
}: DashboardCanvasProps) {
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeRef = useRef<"xlsx" | "csv">("xlsx");

  // Scan state
  const [showCamera, setShowCamera] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Node delete menu state
  const [deleteMenu, setDeleteMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeName: string;
  } | null>(null);

  // Long press detection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const reactFlowRef = useRef<HTMLDivElement>(null);

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

  const buildNodes = useCallback(
    (
      zentaiGamenList: ZentaiGamen[],
      connections: DBConnection[]
    ): Node[] => {
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
        },
      }));
    },
    [project.grid_width, project.grid_height, handleNodeDoubleClick]
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
        width: 20,
        height: 20,
      },
    }));
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildNodes(initialZentaiGamen, initialConnections)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildEdges(initialConnections)
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
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

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        await supabase.from("connections").delete().eq("id", edge.id);
      }
    },
    [supabase]
  );

  const onNodeDragStop = useCallback(
    async (_: unknown, node: Node) => {
      await supabase
        .from("zentai_gamen")
        .update({ position_x: node.position.x, position_y: node.position.y })
        .eq("id", node.id);
    },
    [supabase]
  );

  // Long press handlers
  const onPanePointerDown = useCallback((e: React.PointerEvent) => {
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }, 500);
  }, []);

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

  // Helper: create zentai_gamen with grid data and navigate to editor
  const createAndNavigate = useCallback(
    async (gridData: string, name: string) => {
      const { data, error } = await supabase
        .from("zentai_gamen")
        .insert({
          project_id: project.id,
          name,
          grid_data: gridData,
          position_x: contextMenu?.x ?? 200,
          position_y: contextMenu?.y ?? 200,
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
  const handleImportFile = useCallback(
    (type: "xlsx" | "csv") => {
      fileTypeRef.current = type;
      setContextMenu(null);
      setTimeout(() => fileInputRef.current?.click(), 100);
    },
    []
  );

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      try {
        let cells: Uint8Array;

        if (fileTypeRef.current === "csv") {
          const text = await file.text();
          const result = parseCsv(
            text,
            project.grid_width,
            project.grid_height
          );
          cells = result.cells;
        } else {
          const buffer = await file.arrayBuffer();
          const result = parseExcel(
            buffer,
            project.grid_width,
            project.grid_height
          );
          cells = result.cells;
        }

        let binary = "";
        for (let i = 0; i < cells.length; i++) {
          binary += String.fromCharCode(cells[i]);
        }
        const gridData = btoa(binary);
        await createAndNavigate(gridData, file.name.replace(/\.\w+$/, ""));
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
    if (!deleteMenu) return;
    await supabase
      .from("zentai_gamen")
      .delete()
      .eq("id", deleteMenu.nodeId);
    setNodes((nds) => nds.filter((n) => n.id !== deleteMenu.nodeId));
    setEdges((eds) =>
      eds.filter(
        (e) =>
          e.source !== deleteMenu.nodeId && e.target !== deleteMenu.nodeId
      )
    );
    setDeleteMenu(null);
  }, [deleteMenu, supabase, setNodes, setEdges]);

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
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Hamburger button */}
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
        ref={reactFlowRef}
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
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.1}
          maxZoom={3}
          fitView
          proOptions={{ hideAttribution: true }}
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
          x={contextMenu.x}
          y={contextMenu.y}
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

      {/* Node delete menu */}
      {deleteMenu && (
        <NodeDeleteMenu
          x={deleteMenu.x}
          y={deleteMenu.y}
          nodeName={deleteMenu.nodeName}
          onDelete={handleDeleteNode}
          onClose={() => setDeleteMenu(null)}
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
