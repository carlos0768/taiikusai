import { NextResponse } from "next/server";
import { toErrorResponse, HttpError } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPanelColumns } from "@/lib/panelColumns";
import type { Connection, Project, ProjectBranch, ZentaiGamen } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const admin = createAdminClient();

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single<Project>();

    if (projectError || !project) {
      throw new HttpError(404, "プロジェクトが見つかりません");
    }

    if (!project.highlight_branch_id || !project.highlight_start_zentai_gamen_id) {
      throw new HttpError(404, "表示ページが設定されていません");
    }

    const [
      { data: branch, error: branchError },
      { data: zentaiGamen, error: zentaiGamenError },
      { data: connections, error: connectionsError },
    ] = await Promise.all([
      admin
        .from("project_branches")
        .select("*")
        .eq("id", project.highlight_branch_id)
        .eq("project_id", projectId)
        .single<ProjectBranch>(),
      admin
        .from("zentai_gamen")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", project.highlight_branch_id)
        .order("created_at", { ascending: true }),
      admin
        .from("connections")
        .select("*")
        .eq("project_id", projectId)
        .eq("branch_id", project.highlight_branch_id)
        .order("sort_order", { ascending: true }),
    ]);

    if (branchError || !branch) {
      throw new HttpError(404, "表示対象のブランチが見つかりません");
    }
    if (zentaiGamenError || connectionsError) {
      throw new HttpError(
        500,
        zentaiGamenError?.message ??
          connectionsError?.message ??
          "表示データを読み込めませんでした"
      );
    }

    const allZentaiGamen = (zentaiGamen ?? []) as ZentaiGamen[];
    const allConnections = (connections ?? []) as Connection[];
    const columns = getPanelColumns(allZentaiGamen, allConnections);
    const selectedColumn = columns.find(
      (column) => column.startNodeId === project.highlight_start_zentai_gamen_id
    );

    if (!selectedColumn) {
      throw new HttpError(404, "表示対象のパネル列が見つかりません");
    }

    const zentaiGamenMap = new Map(
      allZentaiGamen.map((item) => [item.id, item])
    );
    const frames = selectedColumn.route.flatMap((nodeId) => {
      const item = zentaiGamenMap.get(nodeId);
      if (!item) return [];

      return [item];
    });

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        gridWidth: branch.grid_width,
        gridHeight: branch.grid_height,
        defaultPanelDurationMs: branch.default_panel_duration_ms,
        defaultIntervalMs: branch.default_interval_ms,
        musicData: branch.music_data,
      },
      branch: {
        id: branch.id,
        name: branch.name,
      },
      panelColumn: {
        label: selectedColumn.label,
        startNodeId: selectedColumn.startNodeId,
        startNodeName: selectedColumn.startNodeName,
      },
      frames,
      connections: allConnections,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
