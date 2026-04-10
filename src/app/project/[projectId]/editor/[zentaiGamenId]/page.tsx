"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { decodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid, type GridData } from "@/lib/grid/types";
import GridEditor from "@/components/editor/GridEditor";
import type { Project, ZentaiGamen } from "@/types";

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
        supabase.from("zentai_gamen").select("*").eq("id", zentaiGamenId).single(),
        supabase.from("projects").select("*").eq("id", projectId).single(),
      ]);

      if (zg && proj) {
        setZentaiGamen(zg);
        setProject(proj);
        const gridData = decodeGrid(zg.grid_data, proj.grid_width, proj.grid_height);
        setGrid(gridData);
      }
      setLoading(false);
    }
    load();
  }, [projectId, zentaiGamenId]);

  const handleSave = useCallback(
    async (gridData: string, name: string) => {
      await supabase
        .from("zentai_gamen")
        .update({
          grid_data: gridData,
          name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", zentaiGamenId);
    },
    [zentaiGamenId, supabase]
  );

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
      onSave={handleSave}
    />
  );
}
