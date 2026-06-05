import { NextResponse, type NextRequest } from "next/server";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import { toErrorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CollapsedPanelGroup, Connection, ZentaiGamen } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const branchId = request.nextUrl.searchParams.get("branch");
    const admin = createAdminClient();

    const context = await fetchProjectBranchContext(admin, projectId, branchId);
    const [
      { data: zentaiGamen, error: zentaiGamenError },
      { data: connections, error: connectionsError },
      { data: collapsedGroups, error: collapsedGroupsError },
    ] = await Promise.all([
      admin
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", context.currentBranch.id)
        .order("created_at", { ascending: true }),
      admin
        .from("connections")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", context.currentBranch.id)
        .order("sort_order", { ascending: true }),
      admin
        .from("collapsed_panel_groups")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", context.currentBranch.id)
        .order("created_at", { ascending: true }),
    ]);

    if (zentaiGamenError) throw zentaiGamenError;
    if (connectionsError) throw connectionsError;
    if (collapsedGroupsError) throw collapsedGroupsError;

    return NextResponse.json({
      project: context.project,
      projectView: context.projectView,
      branches: context.branches,
      currentBranch: context.currentBranch,
      mainBranch: context.mainBranch,
      zentaiGamen: (zentaiGamen ?? []) as ZentaiGamen[],
      connections: (connections ?? []) as Connection[],
      collapsedGroups: (collapsedGroups ?? []) as CollapsedPanelGroup[],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
