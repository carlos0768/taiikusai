import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse } from "@/lib/server/errors";
import type { Project } from "@/types";

export async function GET() {
  try {
    const supabase = await createClient();
    const [{ profile }, projectsResult] = await Promise.all([
      requireAuth(),
      supabase.from("projects").select("*").order("updated_at", {
        ascending: false,
      }),
    ]);

    if (!profile.is_admin && !profile.permissions.can_view_projects) {
      return NextResponse.json({ profile, projects: [] });
    }

    if (projectsResult.error) {
      throw projectsResult.error;
    }

    return NextResponse.json({
      profile,
      projects: (projectsResult.data ?? []) as Project[],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
