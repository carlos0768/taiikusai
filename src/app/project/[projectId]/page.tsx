"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Project, ZentaiGamen, Connection } from "@/types";
import DashboardCanvas from "@/components/dashboard/DashboardCanvas";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [{ data: proj }, { data: zg }, { data: conns }] =
        await Promise.all([
          supabase.from("projects").select("*").eq("id", projectId).single(),
          supabase
            .from("zentai_gamen")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
          supabase
            .from("connections")
            .select("*")
            .eq("project_id", projectId)
            .order("sort_order", { ascending: true }),
        ]);

      setProject(proj);
      setZentaiGamen(zg ?? []);
      setConnections(conns ?? []);
      setLoading(false);
    }
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">プロジェクトが見つかりません</p>
      </div>
    );
  }

  return (
    <DashboardCanvas
      project={project}
      initialZentaiGamen={zentaiGamen}
      initialConnections={connections}
    />
  );
}
