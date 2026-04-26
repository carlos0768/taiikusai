import { NextResponse, type NextRequest } from "next/server";
import { fetchProjectBranchContext } from "@/lib/projectBranches";
import { requireAuth } from "@/lib/server/auth";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { canEditBranch } from "@/lib/server/pseudoGit";
import { createClient } from "@/lib/supabase/server";
import { normalizePanelDsl } from "@/lib/textToPanel/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicToolUseBlock {
  type?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content?: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  model?: string;
  stop_reason?: string;
  usage?: unknown;
}

const PANEL_DSL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    assistantMessage: { type: "string" },
    background: { type: "integer", enum: [0, 1, 2, 3, 4] },
    elements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["rect", "ellipse", "line", "polygon", "text"],
          },
          color: { type: "integer", enum: [0, 1, 2, 3, 4] },
          box: {
            type: "array",
            items: { type: "number" },
            minItems: 4,
            maxItems: 4,
          },
          strokeWidth: { type: "number" },
          text: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
            },
          },
        },
        required: [
          "kind",
          "color",
          "box",
          "strokeWidth",
          "text",
          "points",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "assistantMessage", "background", "elements"],
  additionalProperties: false,
} as const;

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "messages が不正です");
  }

  const filtered = value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !("content" in item)
    ) {
      return [];
    }

    const role = item.role === "assistant" ? "assistant" : "user";
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) return [];

    return [{ role, content: content.slice(0, 4000) } satisfies ChatMessage];
  });

  const compacted: ChatMessage[] = [];
  for (const message of filtered.slice(-16)) {
    if (compacted.length === 0 && message.role !== "user") continue;

    const previous = compacted[compacted.length - 1];
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      compacted.push({ ...message });
    }
  }

  if (!compacted.some((message) => message.role === "user")) {
    throw new HttpError(400, "ユーザー入力がありません");
  }

  return compacted;
}

function buildSystemPrompt(projectName: string, width: number, height: number) {
  return `あなたは体育祭パネル競技用の低解像度パネル設計者です。

目的:
- ユーザーの自然言語から、${width}列 x ${height}行のパネルに投影できるDSLを作る。
- 最終出力はスキーマに一致するJSONだけにする。

座標:
- 原点は左上、xは右方向、yは下方向。
- 数値単位は1マス。
- すべての要素は可能な限り 0 <= x < ${width}, 0 <= y < ${height} に収める。

色:
- 0: 白
- 1: 黄
- 2: 赤
- 3: 黒
- 4: 青

要素:
- rect: box=[x,y,w,h]
- ellipse: box=[cx,cy,rx,ry]
- line: box=[x1,y1,x2,y2]
- text: box=[x,y,fontSize,0]
- polygon: box=[0,0,0,0], points=[[x,y],...]

方針:
- 細かい写実表現より、遠目で読める大きな形にする。
- 文字は短く、太く、大きめにする。
- assistantMessage には設計意図を短く書く。
- title は保存名として使える短い日本語にする。

対象プロジェクト: ${projectName}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { profile } = await requireAuth();
    const requestedBranchId = request.nextUrl.searchParams.get("branch");
    const supabase = await createClient();
    const { project, projectView, currentBranch } = await fetchProjectBranchContext(
      supabase,
      projectId,
      requestedBranchId
    );

    if (!canEditBranch(project, currentBranch, profile)) {
      throw new HttpError(403, "このブランチは編集できません");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpError(500, "ANTHROPIC_API_KEY not configured");
    }

    const { messages: rawMessages } = await request.json();
    const messages = normalizeMessages(rawMessages);
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: buildSystemPrompt(
          project.name,
          projectView.grid_width,
          projectView.grid_height
        ),
        messages,
        tools: [
          {
            name: "create_panel_dsl",
            description:
              "Create a structured DSL for rendering a low-resolution sports festival panel.",
            input_schema: PANEL_DSL_SCHEMA,
          },
        ],
        tool_choice: {
          type: "tool",
          name: "create_panel_dsl",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new HttpError(500, `Anthropic API error: ${text}`);
    }

    const result = (await response.json()) as AnthropicResponse;
    if (result.stop_reason === "refusal") {
      throw new HttpError(400, "モデルが生成を拒否しました");
    }
    if (result.stop_reason === "max_tokens") {
      throw new HttpError(500, "モデル出力が途中で切れました");
    }

    const toolBlock = result.content?.find(
      (block) => block.type === "tool_use" && "name" in block && block.name === "create_panel_dsl"
    ) as AnthropicToolUseBlock | undefined;
    const textBlock = result.content?.find(
      (block) => block.type === "text" && "text" in block
    ) as AnthropicTextBlock | undefined;
    const rawDsl = toolBlock?.input ?? (textBlock?.text ? JSON.parse(textBlock.text) : null);

    if (!rawDsl) {
      throw new HttpError(500, "モデルからDSLを取得できませんでした");
    }

    const { dsl, warnings } = normalizePanelDsl(rawDsl);

    return NextResponse.json({
      dsl,
      model: result.model ?? model,
      usage: result.usage,
      warnings,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
