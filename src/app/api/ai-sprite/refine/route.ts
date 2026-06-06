import { NextResponse } from "next/server";
import { requirePermission, requireAuth } from "@/lib/server/auth";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { readGridDimension } from "@/lib/server/aiSpriteValidation";
import { isMastraMockEnabled } from "@/lib/server/mastra";
import { refineAiSpriteGrid } from "@/lib/server/mastra/refineWorkflow";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { profile } = await requireAuth();
    requirePermission(profile, "can_edit_branch_content");

    const { prompt, gridWidth, gridHeight } = await request.json();
    const userPrompt = typeof prompt === "string" ? prompt.trim() : "";

    if (!userPrompt) {
      throw new HttpError(400, "prompt is required");
    }

    const width = readGridDimension(gridWidth, "gridWidth");
    const height = readGridDimension(gridHeight, "gridHeight");

    if (!isMastraMockEnabled() && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      await refineAiSpriteGrid({
        prompt: userPrompt,
        gridWidth: width,
        gridHeight: height,
      })
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
