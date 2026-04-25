"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getClientErrorMessage } from "@/lib/client/errors";
import { fetchJson } from "@/lib/client/api";
import DashboardCanvas from "@/components/dashboard/DashboardCanvas";
import type { BranchContextResponse, Connection, ZentaiGamen } from "@/types";

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const requestedBranchId = searchParams.get("branch");

  const [context, setContext] = useState<BranchContextResponse | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const contextParams = new URLSearchParams({ includeState: "1" });
      if (requestedBranchId) {
        contextParams.set("branch", requestedBranchId);
      }

      const nextContext = await fetchJson<BranchContextResponse>(
        `/api/projects/${projectId}/branches?${contextParams.toString()}`
      );

      setContext(nextContext);
      setZentaiGamen(nextContext.zentaiGamen ?? []);
      setConnections(nextContext.connections ?? []);
    } catch (err) {
      setError(getClientErrorMessage(err, "プロジェクトを読み込めませんでした"));
    } finally {
      setLoading(false);
    }
  }, [projectId, requestedBranchId]);

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
