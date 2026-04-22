import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { toErrorResponse } from "@/lib/server/errors";

export async function GET() {
  try {
    const { profile } = await requireAuth();
    return NextResponse.json({ profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}
