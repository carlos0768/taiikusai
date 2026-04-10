import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email, password, displayName } = await request.json();

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Create user via admin API (bypasses email confirmation)
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create profile
  if (data.user) {
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.user.id, username: displayName || email });
  }

  return NextResponse.json({ success: true });
}
