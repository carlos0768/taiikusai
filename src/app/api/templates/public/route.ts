import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Template } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const admin = createAdminClient();
    let query = admin
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ templates: (data ?? []) as Template[] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
