import type { PostgrestError } from "@supabase/supabase-js";
import {
  buildBranchStateSnapshot,
  cloneConnectionsToBranch,
  clonePanelsToBranch,
  fetchProjectBranchState,
  getProjectBranchSettings,
  replaceBranchState,
  type ProjectBranchState,
} from "@/lib/projectBranchState";
import {
  fetchProjectBranchContext,
  toBranchScopedProject,
} from "@/lib/projectBranches";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AuthProfile,
  MergeRequest,
  MergeRequestListItem,
  Project,
  ProjectBranch,
} from "@/types";
import { HttpError } from "./errors";

function throwIfError(error: PostgrestError | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export function canEditBranch(
  _project: Project,
  branch: ProjectBranch,
  auth: AuthProfile
) {
  if (auth.is_admin) return true;
  if (branch.is_main) return false;
  if (auth.permissions.can_edit_branch_content) return true;
  return (
    auth.permissions.can_create_branches &&
    branch.created_by === auth.id
  );
}

export function canViewGit(auth: AuthProfile) {
  return (
    auth.is_admin ||
    auth.permissions.can_view_git_requests ||
    auth.permissions.can_request_main_merge ||
    auth.permissions.can_create_branches
  );
}

export async function getProjectById(projectId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single<Project>();

  if (error) {
    throw new HttpError(404, "プロジェクトが見つかりません");
  }

  return data;
}

export async function listProjectBranches(projectId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_branches")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  throwIfError(error);
  return (data ?? []) as ProjectBranch[];
}

export async function resolveBranchById(projectId: string, branchId: string) {
  const branches = await listProjectBranches(projectId);
  const branch = branches.find((item) => item.id === branchId);
  if (!branch) {
    throw new HttpError(404, "ブランチが見つかりません");
  }
  return branch;
}

export async function resolveMainBranch(projectId: string) {
  const branches = await listProjectBranches(projectId);
  const branch = branches.find((item) => item.is_main || item.name === "main");
  if (!branch) {
    throw new HttpError(404, "main ブランチが見つかりません");
  }
  return branch;
}

export async function createMergeRequest(params: {
  projectId: string;
  sourceBranchId: string;
  targetBranchId: string;
  requestedBy: string;
  summary: string;
  requesterDisplayName: string;
  sourceBranchName: string;
}) {
  const admin = createAdminClient();

  const { data: existingOpen, error: existingError } = await admin
    .from("merge_requests")
    .select("id")
    .eq("project_id", params.projectId)
    .eq("source_branch_id", params.sourceBranchId)
    .eq("target_branch_id", params.targetBranchId)
    .eq("status", "open")
    .maybeSingle<{ id: string }>();

  throwIfError(existingError);
  if (existingOpen) {
    throw new HttpError(400, "このブランチの申請はすでに作成されています");
  }

  const { data: request, error } = await admin
    .from("merge_requests")
    .insert({
      project_id: params.projectId,
      source_branch_id: params.sourceBranchId,
      target_branch_id: params.targetBranchId,
      requested_by: params.requestedBy,
      summary: params.summary.trim(),
      status: "open",
    })
    .select("*")
    .single<MergeRequest>();

  if (error || !request) {
    throw new HttpError(400, error?.message ?? "申請を作成できませんでした");
  }

  await notifyAdminsForMergeRequest({
    projectId: params.projectId,
    mergeRequestId: request.id,
    requesterDisplayName: params.requesterDisplayName,
    sourceBranchName: params.sourceBranchName,
  });

  return request;
}

export async function listMergeRequests(
  projectId: string,
  userId: string,
  isAdmin: boolean
): Promise<MergeRequestListItem[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("merge_requests")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  throwIfError(error);

  const requests = (data ?? []) as MergeRequest[];
  const filtered = isAdmin
    ? requests
    : requests.filter((request) => request.requested_by === userId);

  const branchIds = new Set<string>();
  const userIds = new Set<string>();
  filtered.forEach((request) => {
    branchIds.add(request.source_branch_id);
    branchIds.add(request.target_branch_id);
    userIds.add(request.requested_by);
    if (request.reviewed_by) {
      userIds.add(request.reviewed_by);
    }
  });

  const [{ data: branchRows, error: branchError }, { data: profileRows, error: profileError }] =
    await Promise.all([
      branchIds.size === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("project_branches").select("id, name").in("id", [...branchIds]),
      userIds.size === 0
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from("profiles")
            .select("id, display_name, login_id")
            .in("id", [...userIds]),
    ]);

  throwIfError(branchError);
  throwIfError(profileError);

  const branchMap = new Map(
    ((branchRows ?? []) as { id: string; name: string }[]).map((row) => [
      row.id,
      row.name,
    ])
  );
  const profileMap = new Map(
    (
      (profileRows ?? []) as {
        id: string;
        display_name: string | null;
        login_id: string;
      }[]
    ).map((row) => [row.id, row.display_name || row.login_id])
  );

  return filtered.map((request) => ({
    ...request,
    source_branch_name: branchMap.get(request.source_branch_id) ?? "unknown",
    target_branch_name: branchMap.get(request.target_branch_id) ?? "unknown",
    requested_by_display_name:
      profileMap.get(request.requested_by) ?? "unknown user",
    reviewed_by_display_name: request.reviewed_by
      ? profileMap.get(request.reviewed_by) ?? "unknown user"
      : null,
  }));
}

export async function reviewMergeRequest(params: {
  requestId: string;
  reviewerId: string;
  approve: boolean;
}) {
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("merge_requests")
    .select("*")
    .eq("id", params.requestId)
    .single<MergeRequest>();

  if (error || !request) {
    throw new HttpError(404, "申請が見つかりません");
  }

  if (request.status !== "open") {
    throw new HttpError(400, "この申請はすでに処理済みです");
  }

  let createdMergeId: string | null = null;
  let targetBranch: ProjectBranch | null = null;
  let targetState: ProjectBranchState | null = null;

  try {
    if (params.approve) {
      const context = await fetchProjectBranchContext(
        admin,
        request.project_id,
        request.target_branch_id
      );
      const sourceBranch = context.branches.find(
        (branch) => branch.id === request.source_branch_id
      );
      targetBranch = context.branches.find(
        (branch) => branch.id === request.target_branch_id
      ) ?? context.mainBranch;

      if (!sourceBranch || !targetBranch) {
        throw new HttpError(404, "対象ブランチが見つかりません");
      }

      const [loadedTargetState, sourceState] = await Promise.all([
        fetchProjectBranchState(
          admin,
          request.project_id,
          toBranchScopedProject(context.project, targetBranch),
          targetBranch
        ),
        fetchProjectBranchState(
          admin,
          request.project_id,
          toBranchScopedProject(context.project, sourceBranch),
          sourceBranch
        ),
      ]);
      targetState = loadedTargetState;

      const { data: mergeRow, error: mergeInsertError } = await admin
        .from("project_branch_merges")
        .insert({
          project_id: request.project_id,
          source_branch_id: sourceBranch.id,
          target_branch_id: targetBranch.id,
          snapshot: buildBranchStateSnapshot(targetState),
        })
        .select("id")
        .single<{ id: string }>();

      if (mergeInsertError || !mergeRow) {
        throw mergeInsertError ?? new Error("merge ログの保存に失敗しました");
      }

      createdMergeId = mergeRow.id;

      const { panels, idMap } = clonePanelsToBranch({
        projectId: request.project_id,
        branchId: targetBranch.id,
        panels: sourceState.panels,
      });
      const connections = cloneConnectionsToBranch({
        projectId: request.project_id,
        branchId: targetBranch.id,
        connections: sourceState.connections,
        panelIdMap: idMap,
      });

      await replaceBranchState(admin, {
        projectId: request.project_id,
        targetBranch,
        settings: getProjectBranchSettings(sourceState.project),
        panels,
        connections,
        syncMainCache: targetBranch.is_main,
      });
    }

    const nextStatus = params.approve ? "approved" : "rejected";
    const { error: updateError } = await admin
      .from("merge_requests")
      .update({
        status: nextStatus,
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", params.requestId);

    throwIfError(updateError);
    return nextStatus;
  } catch (error) {
    if (params.approve && targetBranch && targetState) {
      try {
        await replaceBranchState(admin, {
          projectId: request.project_id,
          targetBranch,
          settings: getProjectBranchSettings(targetState.project),
          panels: targetState.panels,
          connections: targetState.connections,
          syncMainCache: targetBranch.is_main,
        });

        if (createdMergeId) {
          await admin.from("project_branch_merges").delete().eq("id", createdMergeId);
        }
      } catch {
        throw new HttpError(500, "main の復元に失敗しました");
      }
    }

    throw error;
  }
}

export async function countUnreadGitNotifications(
  recipientId: string,
  projectId?: string
) {
  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("kind", "merge_request")
    .eq("is_read", false);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { count, error } = await query;
  throwIfError(error);
  return count ?? 0;
}

export async function markGitNotificationsAsRead(
  recipientId: string,
  projectId?: string
) {
  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("recipient_id", recipientId)
    .eq("kind", "merge_request")
    .eq("is_read", false);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { error } = await query;
  throwIfError(error);
}

async function notifyAdminsForMergeRequest(params: {
  projectId: string;
  mergeRequestId: string;
  requesterDisplayName: string;
  sourceBranchName: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_admin", true)
    .eq("status", "active")
    .eq("git_notifications_enabled", true);

  throwIfError(error);

  const notifications = ((data ?? []) as { id: string }[]).map((row) => ({
    recipient_id: row.id,
    project_id: params.projectId,
    kind: "merge_request",
    title: "main へのマージ申請があります",
    body: `${params.requesterDisplayName} が ${params.sourceBranchName} から main への申請を作成しました`,
    reference_id: params.mergeRequestId,
  }));

  if (notifications.length === 0) {
    return;
  }

  const { error: insertError } = await admin
    .from("notifications")
    .insert(notifications);
  throwIfError(insertError);
}
