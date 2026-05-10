import { NextResponse } from "next/server";
import { requirePermission, requireAuth } from "@/lib/server/auth";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { generateAiSpriteGrid } from "@/lib/server/aiSprite";

export const runtime = "nodejs";

function readGridDimension(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 128
  ) {
    throw new HttpError(400, `${label} must be an integer from 1 to 128`);
  }

  return value;
}

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

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: "REPLICATE_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...(await generateAiSpriteGrid({
        apiKey,
        prompt: userPrompt,
        gridWidth: width,
        gridHeight: height,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
