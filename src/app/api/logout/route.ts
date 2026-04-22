import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse } from "@/lib/server/errors";

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
