"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getClientErrorMessage } from "@/lib/client/errors";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import DashboardCanvas from "@/components/dashboard/DashboardCanvas";
import type { BranchContextResponse, Connection, ZentaiGamen } from "@/types";

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const requestedBranchId = searchParams.get("branch");
  const supabase = useMemo(() => createClient(), []);

  const [context, setContext] = useState<BranchContextResponse | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextContext = await fetchJson<BranchContextResponse>(
        `/api/projects/${projectId}/branches${
          requestedBranchId ? `?branch=${requestedBranchId}` : ""
        }`
      );

      const [{ data: nextZentaiGamen, error: zentaiGamenError }, { data: nextConnections, error: connectionsError }] =
        await Promise.all([
          supabase
            .from("zentai_gamen")
            .select("*")
            .eq("project_id", projectId)
            .eq("branch_id", nextContext.currentBranch.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("connections")
            .select("*")
            .eq("project_id", projectId)
            .eq("branch_id", nextContext.currentBranch.id)
            .order("sort_order", { ascending: true }),
        ]);

      if (zentaiGamenError) {
        throw zentaiGamenError;
      }
      if (connectionsError) {
        throw connectionsError;
      }

      setContext(nextContext);
      setZentaiGamen((nextZentaiGamen ?? []) as ZentaiGamen[]);
      setConnections((nextConnections ?? []) as Connection[]);
    } catch (err) {
      setError(getClientErrorMessage(err, "プロジェクトを読み込めませんでした"));
    } finally {
      setLoading(false);
    }
  }, [projectId, requestedBranchId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted">{error ?? "プロジェクトが見つかりません"}</p>
      </div>
    );
  }

  return (
    <DashboardCanvas
      project={context.project}
      branches={context.branches}
      currentBranch={context.currentBranch}
      initialZentaiGamen={zentaiGamen}
      initialConnections={connections}
      auth={context.auth}
      unreadGitNotifications={context.unreadGitNotifications}
    />
  );
}
