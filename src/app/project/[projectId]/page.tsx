"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getClientErrorMessage } from "@/lib/client/errors";
import { fetchJson } from "@/lib/client/api";
import { READONLY_AUTH_PROFILE } from "@/lib/client/authProfile";
import { PUBLIC_CLIENT_ONLY_AUTH_PROFILE } from "@/lib/publicAccess";
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

interface PublicProjectResponse {
  projectView: BranchScopedProject;
  branches: ProjectBranch[];
  currentBranch: ProjectBranch;
  zentaiGamen: ZentaiGamen[];
  connections: Connection[];
  collapsedGroups: CollapsedPanelGroup[];
}

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
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedPanelGroup[]>(
    []
  );
  const [auth, setAuth] = useState<AuthProfile>(READONLY_AUTH_PROFILE);
  const [unreadGitNotifications, setUnreadGitNotifications] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const query = requestedBranchId
        ? `?branch=${encodeURIComponent(requestedBranchId)}`
        : "";
      const context = await fetchJson<PublicProjectResponse>(
        `/api/projects/${projectId}/public${query}`
      );

      setProject(context.projectView);
      setBranches(context.branches);
      setCurrentBranch(context.currentBranch);
      setZentaiGamen(context.zentaiGamen);
      setConnections(context.connections);
      setCollapsedGroups(context.collapsedGroups);
    } catch (err) {
      setError(getClientErrorMessage(err, "プロジェクトを読み込めませんでした"));
    }
  }, [projectId, requestedBranchId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
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
          setAuth(PUBLIC_CLIENT_ONLY_AUTH_PROFILE);
          setUnreadGitNotifications(0);
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
