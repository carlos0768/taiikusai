import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AuthProfile,
  BranchContextResponse,
  MergeRequestListItem,
  Project,
  ProjectBranch,
  ZentaiGamen,
  Connection,
} from "@/types";
import { HttpError } from "./errors";

const BRANCH_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;

function throwIfError(error: PostgrestError | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export function normalizeBranchName(value: string) {
  return value.trim().toLowerCase();
}

export function assertBranchName(value: string) {
  const normalized = normalizeBranchName(value);
  if (!BRANCH_NAME_PATTERN.test(normalized)) {
    throw new HttpError(
      400,
      "ブランチ名は英数字小文字・ハイフン・アンダースコアで入力してください"
    );
  }
  if (normalized === "main") {
    throw new HttpError(400, "main は予約済みのブランチ名です");
  }
}

export function canEditBranch(project: Project, branch: ProjectBranch, auth: AuthProfile) {
  if (auth.is_admin) return true;
  if (!auth.permissions.can_edit_branch_content) return false;
  if (!branch.is_main) return true;
  return !project.main_branch_requires_admin_approval;
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

export async function resolveBranch(projectId: string, branchName?: string) {
  const admin = createAdminClient();
  const targetName = normalizeBranchName(branchName ?? "main") || "main";
  const { data, error } = await admin
    .from("project_branches")
    .select("*")
    .eq("project_id", projectId)
    .eq("name", targetName)
    .maybeSingle<ProjectBranch>();

  throwIfError(error);

  if (!data) {
    throw new HttpError(404, "ブランチが見つかりません");
  }

  return data;
}

export async function getBranchContext(
  projectId: string,
  branchName: string | undefined,
  auth: AuthProfile
): Promise<BranchContextResponse> {
  const [project, branches] = await Promise.all([
    getProjectById(projectId),
    listProjectBranches(projectId),
  ]);

  const currentBranch =
    branches.find((branch) => branch.name === normalizeBranchName(branchName ?? "main")) ??
    branches.find((branch) => branch.is_main) ??
    branches[0];

  if (!currentBranch) {
    throw new HttpError(404, "ブランチが見つかりません");
  }

  const unreadGitNotifications = await countUnreadGitNotifications(
    auth.id,
    auth.is_admin ? projectId : undefined
  );

  return {
    project,
    branches,
    currentBranch,
    auth,
    canEditCurrentBranch: canEditBranch(project, currentBranch, auth),
    canCreateBranches: auth.is_admin || auth.permissions.can_create_branches,
    canRequestMerge:
      currentBranch.is_main
        ? false
        : auth.is_admin || auth.permissions.can_request_main_merge,
    canViewGitRequests: canViewGit(auth),
    unreadGitNotifications,
  };
}

export async function cloneBranchFromSource(params: {
  projectId: string;
  branchName: string;
  sourceBranchId: string;
  createdBy: string;
}) {
  const admin = createAdminClient();
  const normalizedName = normalizeBranchName(params.branchName);
  assertBranchName(normalizedName);

  const { data: branch, error: branchError } = await admin
    .from("project_branches")
    .insert({
      project_id: params.projectId,
      name: normalizedName,
      is_main: false,
      source_branch_id: params.sourceBranchId,
      created_by: params.createdBy,
    })
    .select("*")
    .single<ProjectBranch>();

  if (branchError) {
    throw new HttpError(400, branchError.message);
  }

  await copyBranchSnapshot(params.sourceBranchId, branch.id, params.projectId);
  return branch;
}

export async function copyBranchSnapshot(
  sourceBranchId: string,
  targetBranchId: string,
  projectId: string
) {
  const admin = createAdminClient();
  const [{ data: sourceNodes, error: nodeError }, { data: sourceConnections, error: connectionError }] =
    await Promise.all([
      admin
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", sourceBranchId)
        .order("created_at", { ascending: true }),
      admin
        .from("connections")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", sourceBranchId)
        .order("sort_order", { ascending: true }),
    ]);

  throwIfError(nodeError);
  throwIfError(connectionError);

  const nodeIdMap = new Map<string, string>();
  const nextNodes = ((sourceNodes ?? []) as ZentaiGamen[]).map((node) => {
    const nextId = randomUUID();
    nodeIdMap.set(node.id, nextId);
    return {
      id: nextId,
      project_id: node.project_id,
      branch_id: targetBranchId,
      name: node.name,
      grid_data: node.grid_data,
      thumbnail: node.thumbnail,
      position_x: node.position_x,
      position_y: node.position_y,
      memo: node.memo,
    };
  });

  if (nextNodes.length > 0) {
    const { error } = await admin.from("zentai_gamen").insert(nextNodes);
    throwIfError(error);
  }

  const nextConnections = ((sourceConnections ?? []) as Connection[])
    .filter(
      (connection) =>
        nodeIdMap.has(connection.source_id) && nodeIdMap.has(connection.target_id)
    )
    .map((connection) => ({
      id: randomUUID(),
      project_id: connection.project_id,
      branch_id: targetBranchId,
      source_id: nodeIdMap.get(connection.source_id)!,
      target_id: nodeIdMap.get(connection.target_id)!,
      sort_order: connection.sort_order,
    }));

  if (nextConnections.length > 0) {
    const { error } = await admin.from("connections").insert(nextConnections);
    throwIfError(error);
  }
}

export async function replaceMainWithBranch(projectId: string, sourceBranchId: string) {
  const admin = createAdminClient();
  const mainBranch = await resolveBranch(projectId, "main");

  const { error: deleteConnectionsError } = await admin
    .from("connections")
    .delete()
    .eq("project_id", projectId)
    .eq("branch_id", mainBranch.id);
  throwIfError(deleteConnectionsError);

  const { error: deleteNodesError } = await admin
    .from("zentai_gamen")
    .delete()
    .eq("project_id", projectId)
    .eq("branch_id", mainBranch.id);
  throwIfError(deleteNodesError);

  await copyBranchSnapshot(sourceBranchId, mainBranch.id, projectId);
  return mainBranch;
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
    .single();

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

  const requests = (data ?? []) as {
    id: string;
    project_id: string;
    source_branch_id: string;
    target_branch_id: string;
    requested_by: string;
    summary: string;
    status: MergeRequestListItem["status"];
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
  }[];

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
      admin
        .from("project_branches")
        .select("id, name")
        .in("id", Array.from(branchIds)),
      admin
        .from("profiles")
        .select("id, display_name, login_id")
        .in("id", Array.from(userIds)),
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
    .single();

  if (error || !request) {
    throw new HttpError(404, "申請が見つかりません");
  }

  if (request.status !== "open") {
    throw new HttpError(400, "この申請はすでに処理済みです");
  }

  if (params.approve) {
    await replaceMainWithBranch(request.project_id, request.source_branch_id);
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
