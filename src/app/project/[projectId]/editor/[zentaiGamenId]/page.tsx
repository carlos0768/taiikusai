"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid } from "@/lib/grid/codec";
import type { GridData } from "@/lib/grid/types";
import type { ColorIndex } from "@/lib/grid/types";
import GridEditor from "@/components/editor/GridEditor";
import { findPlaybackRoutes } from "@/lib/api/connections";
import { generateScriptHtml } from "@/lib/export/generateScript";
import type { Project, ZentaiGamen, Connection } from "@/types";
import JSZip from "jszip";

export default function EditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const zentaiGamenId = params.zentaiGamenId as string;
  const [grid, setGrid] = useState<GridData | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [{ data: zg }, { data: proj }] = await Promise.all([
        supabase
          .from("zentai_gamen")
          .select("*")
          .eq("id", zentaiGamenId)
          .single(),
        supabase.from("projects").select("*").eq("id", projectId).single(),
      ]);

      if (zg && proj) {
        setZentaiGamen(zg);
        setProject(proj);
        const gridData = decodeGrid(
          zg.grid_data,
          proj.grid_width,
          proj.grid_height
        );
        setGrid(gridData);
      }
      setLoading(false);
    }
    load();
  }, [projectId, zentaiGamenId]);

  const handleSave = useCallback(
    async (gridData: string, name: string, memo: string) => {
      await supabase
        .from("zentai_gamen")
        .update({
          grid_data: gridData,
          name,
          memo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", zentaiGamenId);
    },
    [zentaiGamenId, supabase]
  );

  const handleExport = useCallback(async () => {
    if (!project) return;

    // Fetch all zentai_gamen and connections for this project
    const [{ data: allZg }, { data: allConns }] = await Promise.all([
      supabase
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId),
      supabase
        .from("connections")
        .select("*")
        .eq("project_id", projectId),
    ]);

    if (!allZg || !allConns) {
      alert("データの取得に失敗しました");
      return;
    }

    // Find the route starting from this zentai_gamen
    const routes = findPlaybackRoutes(allConns, zentaiGamenId);
    const route = routes[0]; // Use first route
    if (!route || route.length === 0) {
      alert("連結された全体画面がありません");
      return;
    }

    // Build scene data
    const zgMap = new Map(allZg.map((z: ZentaiGamen) => [z.id, z]));
    const scenes: { grid: GridData; memo: string }[] = [];
    for (const nodeId of route) {
      const zg = zgMap.get(nodeId);
      if (zg) {
        scenes.push({
          grid: decodeGrid(
            zg.grid_data,
            project.grid_width,
            project.grid_height
          ),
          memo: zg.memo || "",
        });
      }
    }

    if (scenes.length === 0) {
      alert("シーンデータがありません");
      return;
    }

    // Generate HTML for each cell position
    const zip = new JSZip();
    const w = project.grid_width;
    const h = project.grid_height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cellScenes = scenes.map((scene, idx) => ({
          sceneNumber: idx + 1,
          colorIndex: scene.grid.cells[y * w + x] as ColorIndex,
          memo: scene.memo,
        }));

        const html = generateScriptHtml(
          x,
          y,
          cellScenes,
          project.name,
          w,
          h
        );

        zip.file(`${y + 1}列${x + 1}番.html`, html);
      }
    }

    // Download ZIP
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}_パネル台本.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project, projectId, zentaiGamenId, supabase]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!grid || !zentaiGamen || !project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">データが見つかりません</p>
      </div>
    );
  }

  return (
    <GridEditor
      initialGrid={grid}
      zentaiGamenId={zentaiGamenId}
      projectId={projectId}
      initialName={zentaiGamen.name}
      initialMemo={zentaiGamen.memo || ""}
      onSave={handleSave}
      onExport={handleExport}
    />
  );
}
