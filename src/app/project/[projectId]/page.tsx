"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getClientErrorMessage } from "@/lib/client/errors";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { READONLY_AUTH_PROFILE } from "@/lib/client/authProfile";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import DashboardCanvas from "@/components/dashboard/DashboardCanvas";
import type {
  AuthProfile,
  BranchScopedProject,
  CollapsedPanelGroup,
  Connection,
  GitNotificationSummary,
  ProjectBranch,
  ZentaiGamen,
} from "@/types";

interface MeResponse {
  profile: AuthProfile;
}

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const requestedBranchId = searchParams.get("branch");
  const supabase = useMemo(() => createClient(), []);

  const [project, setProject] = useState<BranchScopedProject | null>(null);
  const [branches, setBranches] = useState<ProjectBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<ProjectBranch | null>(null);
  const [zentaiGamen, setZentaiGamen] = useState<ZentaiGamen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedPanelGroup[]>(
    []
  );
  const [auth, setAuth] = useState<AuthProfile>(READONLY_AUTH_PROFILE);
  const [unreadGitNotifications, setUnreadGitNotifications] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [context, panelsResult, connectionsResult, collapsedGroupsResult] =
        await Promise.all([
          fetchProjectBranchContext(supabase, projectId, requestedBranchId),
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
          supabase
            .from("collapsed_panel_groups")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
        ]);

      if (panelsResult.error) throw panelsResult.error;
      if (connectionsResult.error) throw connectionsResult.error;
      if (collapsedGroupsResult.error) throw collapsedGroupsResult.error;

      setProject(context.projectView);
      setBranches(context.branches);
      setCurrentBranch(context.currentBranch);
      setZentaiGamen(
        ((panelsResult.data ?? []) as ZentaiGamen[]).filter(
          (panel) => panel.branch_id === context.currentBranch.id
        )
      );
      setConnections(
        ((connectionsResult.data ?? []) as Connection[]).filter(
          (connection) => connection.branch_id === context.currentBranch.id
        )
      );
      setCollapsedGroups(
        ((collapsedGroupsResult.data ?? []) as CollapsedPanelGroup[]).filter(
          (group) => group.branch_id === context.currentBranch.id
        )
      );
    } catch (err) {
      setError(getClientErrorMessage(err, "プロジェクトを読み込めませんでした"));
    }
  }, [projectId, requestedBranchId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const [{ profile }, notifications] = await Promise.all([
          fetchJson<MeResponse>("/api/auth/me"),
          fetchJson<GitNotificationSummary>(
            `/api/notifications/unread?projectId=${projectId}`
          ).catch(() => ({ unreadCount: 0, hasUnread: false })),
        ]);
        if (cancelled) return;
        setAuth(profile);
        setUnreadGitNotifications(notifications.unreadCount);
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  if (!project || !currentBranch) {
    return (
      <div className="h-full flex items-center justify-center">
        {error && <p className="text-muted">{error}</p>}
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
      initialCollapsedGroups={collapsedGroups}
      auth={auth}
      unreadGitNotifications={unreadGitNotifications}
    />
  );
}
