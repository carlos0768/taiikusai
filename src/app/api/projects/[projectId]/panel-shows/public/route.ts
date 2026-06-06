import { NextResponse, type NextRequest } from "next/server";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PanelShow, ZentaiGamen } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const branchId = request.nextUrl.searchParams.get("branch");
    const showId = request.nextUrl.searchParams.get("showId");

    if (!branchId) {
      throw new HttpError(400, "branch が指定されていません");
    }

    const admin = createAdminClient();

    if (showId) {
      const { data: panelShow, error: showError } = await admin
        .from("panel_shows")
        .select("*")
        .eq("id", showId)
        .eq("project_id", projectId)
        .eq("branch_id", branchId)
        .single<PanelShow>();

      if (showError || !panelShow) {
        throw new HttpError(404, "パネルショーが見つかりません");
      }

      const { data: panels, error: panelsError } = await admin
        .from("zentai_gamen")
        .select("*")
        .in("id", panelShow.panel_ids)
        .eq("branch_id", panelShow.branch_id);

      if (panelsError) throw panelsError;

      return NextResponse.json({
        panelShow,
        panels: (panels ?? []) as ZentaiGamen[],
      });
    }

    const { data, error } = await admin
      .from("panel_shows")
      .select("*")
      .eq("project_id", projectId)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ panelShows: (data ?? []) as PanelShow[] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
