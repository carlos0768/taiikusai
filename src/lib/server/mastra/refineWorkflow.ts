import { normalizeSprite, renderSpriteToGrid } from "@/lib/grid/sprite";
import type { GridData } from "@/lib/grid/types";
import { buildSpritePrompt } from "@/lib/server/aiSprite";
import { HttpError } from "@/lib/server/errors";
import {
  critiqueSprite,
  type CritiqueResult,
} from "@/lib/server/mastra/critiqueAgent";
import {
  generateSpriteCandidate,
} from "@/lib/server/mastra/spriteAgent";
import { renderToPng } from "@/lib/server/mastra/renderToPng";

const MAX_ITER = 3;
const ACCEPT_SCORE = 75;

export interface RefineHistoryEntry {
  iter: number;
  score: number;
  issues: string[];
  suggestion: string;
}

export interface RefinedSpriteResult {
  gridData: string;
  name: string;
  iterations: number;
  score: number;
  history: RefineHistoryEntry[];
}

interface RefineAiSpriteGridInput {
  prompt: string;
  gridWidth: number;
  gridHeight: number;
}

interface GeneratedGrid {
  grid: GridData;
  gridData: string;
  name: string;
}

interface BestSprite {
  score: number;
  gridData: string;
  name: string;
}

export async function refineAiSpriteGrid({
  prompt,
  gridWidth,
  gridHeight,
}: RefineAiSpriteGridInput): Promise<RefinedSpriteResult> {
  let prevSuggestion: string | null = null;
  let prevScore: number | null = null;
  let prevIssues: string[] = [];
  let best: BestSprite | null = null;
  const history: RefineHistoryEntry[] = [];

  for (let iter = 1; iter <= MAX_ITER; iter += 1) {
    const message = composeUserMessage({
      prompt,
      width: gridWidth,
      height: gridHeight,
      prevSuggestion,
      prevScore,
      prevIssues,
    });
    const generated = await generateWithRetry({
      message,
      gridWidth,
      gridHeight,
      iteration: iter,
    });
    const png = await renderGridPng(generated.grid.cells, gridWidth, gridHeight);
    const critique = await critiqueWithFallback({
      prompt,
      png,
      iteration: iter,
      best,
    });

    if (!critique) {
      break;
    }

    history.push({
      iter,
      score: critique.score,
      issues: critique.issues,
      suggestion: critique.suggestion,
    });

    if (!best || critique.score > best.score) {
      best = {
        score: critique.score,
        gridData: generated.gridData,
        name: generated.name,
      };
    }

    if (critique.score >= ACCEPT_SCORE) {
      break;
    }

    prevSuggestion = critique.suggestion;
    prevScore = critique.score;
    prevIssues = critique.issues;
  }

  if (!best) {
    throw new HttpError(502, "AI sprite refinement did not produce a result");
  }

  return {
    gridData: best.gridData,
    name: best.name,
    iterations: history.length,
    score: best.score,
    history,
  };
}

function composeUserMessage({
  prompt,
  width,
  height,
  prevSuggestion,
  prevScore,
  prevIssues,
}: {
  prompt: string;
  width: number;
  height: number;
  prevSuggestion: string | null;
  prevScore: number | null;
  prevIssues: string[];
}): string {
  const basePrompt = buildSpritePrompt(prompt, width, height);

  if (prevSuggestion === null || prevScore === null) {
    return basePrompt;
  }

  const issues =
    prevIssues.length > 0
      ? prevIssues.map((issue) => `    - ${issue}`).join("\n")
      : "    - なし";

  return `前回の試みへのフィードバック（必ず反映してください）:
- 前回スコア: ${prevScore}/100
- 主な問題点:
${issues}
- 改善指示: ${prevSuggestion}

上記を踏まえた上で、以下の指示に従って再度生成してください。
---
${basePrompt}`;
}

async function generateWithRetry({
  message,
  gridWidth,
  gridHeight,
  iteration,
}: {
  message: string;
  gridWidth: number;
  gridHeight: number;
  iteration: number;
}): Promise<GeneratedGrid> {
  let prompt = message;
  let lastError = "unknown generation error";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const object = await generateSpriteCandidate({
        message: prompt,
        gridWidth,
        gridHeight,
        iteration,
      });
      const sprite = normalizeSprite(object.sprite);
      const grid = renderSpriteToGrid(sprite, gridWidth, gridHeight);

      return {
        grid,
        gridData: encodeGridCells(grid.cells),
        name: normalizeName(object.name),
      };
    } catch (err) {
      lastError = getErrorMessage(err);

      if (attempt === 1) {
        prompt = `${message}

前回の出力はスキーマまたはsprite制約に違反しました:
${lastError}

JSON形式、sprite寸法、palette、rows の制約をすべて修正して再出力してください。`;
      }
    }
  }

  throw new HttpError(502, `AI sprite generation failed: ${lastError}`);
}

async function critiqueWithFallback({
  prompt,
  png,
  iteration,
  best,
}: {
  prompt: string;
  png: Buffer;
  iteration: number;
  best: BestSprite | null;
}): Promise<CritiqueResult | null> {
  try {
    return await critiqueSprite({
      userPrompt: prompt,
      pngBuffer: png,
      iteration,
    });
  } catch (err) {
    if (best) {
      return null;
    }

    throw new HttpError(502, `AI sprite critique failed: ${getErrorMessage(err)}`);
  }
}

async function renderGridPng(
  cells: Uint8Array,
  width: number,
  height: number
): Promise<Buffer> {
  try {
    return await renderToPng(cells, width, height);
  } catch (err) {
    throw new HttpError(500, `Failed to render sprite PNG: ${getErrorMessage(err)}`);
  }
}

function encodeGridCells(cells: Uint8Array): string {
  return Buffer.from(cells).toString("base64");
}

function normalizeName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || "AIピクセル";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
