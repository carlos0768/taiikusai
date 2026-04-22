"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchBranchConnections,
  fetchBranchPanels,
} from "@/lib/projectBranchState";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import type {
  BranchScopedProject,
  ProjectBranch,
  ZentaiGamen,
  Connection,
} from "@/types";
import DashboardCanvas from "@/components/dashboard/DashboardCanvas";

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const requestedBranchId = searchParams.get("branch");
  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [branches, setBranches] = useState<ProjectBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<ProjectBranch | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const contextResult = await fetchProjectBranchContext(
          supabase,
          projectId,
          requestedBranchId
        );
        const [zg, conns] = await Promise.all([
          fetchBranchPanels(supabase, projectId, contextResult.currentBranch.id),
          fetchBranchConnections(
            supabase,
            projectId,
            contextResult.currentBranch.id
          ),
        ]);

        setProject(contextResult.projectView);
        setBranches(contextResult.branches);
        setCurrentBranch(contextResult.currentBranch);
        setZentaiGamen(zg);
        setConnections(conns);
      } catch {
        setProject(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectId, requestedBranchId, supabase]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!project || !currentBranch) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">プロジェクトが見つかりません</p>
      </div>
    );
  }

  return (
    <DashboardCanvas
      project={project}
      branches={branches}
      currentBranch={currentBranch}
      initialZentaiGamen={zentaiGamen}
      initialConnections={connections}
    />
  );
}
