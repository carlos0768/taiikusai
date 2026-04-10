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
import { encodeGrid, decodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid } from "@/lib/grid/types";
import type { Project, ZentaiGamen, Connection as DBConnection } from "@/types";
import ZentaiGamenNode from "./ZentaiGamenNode";
import ConnectionEdge from "./ConnectionEdge";
import ContextMenu from "./ContextMenu";
import NodeDeleteMenu from "./NodeDeleteMenu";
import Sidebar from "./Sidebar";

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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
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

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      router.push(`/project/${project.id}/editor/${nodeId}`);
    },
    [project.id, router]
  );

  // Build nodes from zentai_gamen data
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

  // Build edges from connections
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

  // Handle new connection
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Save to DB
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

      // Update node data to reflect connection state
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

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        await supabase.from("connections").delete().eq("id", edge.id);
      }
    },
    [supabase]
  );

  // Save node position on drag end
  const onNodeDragStop = useCallback(
    async (_: unknown, node: Node) => {
      await supabase
        .from("zentai_gamen")
        .update({
          position_x: node.position.x,
          position_y: node.position.y,
        })
        .eq("id", node.id);
    },
    [supabase]
  );

  // Long press on pane (empty area)
  const onPanePointerDown = useCallback(
    (e: React.PointerEvent) => {
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          flowX: 0, // Will be calculated from ReactFlow viewport
          flowY: 0,
        });
      }, 500);
    },
    []
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

  // Long press on node
  const onNodePointerDown = useCallback(
    (nodeId: string, nodeName: string, e: React.PointerEvent) => {
      const nodeTimer = setTimeout(() => {
        setDeleteMenu({
          x: e.clientX,
          y: e.clientY,
          nodeId,
          nodeName,
        });
      }, 500);

      const handleMove = (me: PointerEvent) => {
        const dx = me.clientX - e.clientX;
        const dy = me.clientY - e.clientY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(nodeTimer);
          document.removeEventListener("pointermove", handleMove);
          document.removeEventListener("pointerup", handleUp);
        }
      };
      const handleUp = () => {
        clearTimeout(nodeTimer);
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
      };
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    []
  );

  // Create new zentai_gamen (Manual)
  const handleCreateManual = useCallback(async () => {
    const emptyGrid = createEmptyGrid(project.grid_width, project.grid_height);
    const encoded = encodeGrid(emptyGrid);

    const { data, error } = await supabase
      .from("zentai_gamen")
      .insert({
        project_id: project.id,
        name: "Untitled",
        grid_data: encoded,
        position_x: contextMenu?.x ?? 200,
        position_y: contextMenu?.y ?? 200,
      })
      .select()
      .single();

    setContextMenu(null);

    if (error || !data) return;

    // Navigate to editor
    router.push(`/project/${project.id}/editor/${data.id}`);
  }, [project, supabase, contextMenu, router]);

  // Delete node
  const handleDeleteNode = useCallback(async () => {
    if (!deleteMenu) return;

    // Delete from DB (cascades to connections)
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

  return (
    <div className="h-full w-full relative">
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
          onTemplate={() => {
            setContextMenu(null);
            router.push(`/project/${project.id}/templates`);
          }}
          onExisting={() => {
            setContextMenu(null);
            // TODO: show existing designs submenu
          }}
          onImport={() => {
            setContextMenu(null);
            // TODO: import flow
          }}
          onScan={() => {
            setContextMenu(null);
            // TODO: scan flow
          }}
          onClose={() => setContextMenu(null)}
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
