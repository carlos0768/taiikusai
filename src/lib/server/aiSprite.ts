import { normalizeSprite, renderSpriteToGrid } from "../grid/sprite";

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

export interface AiSpriteResult {
  gridData: string;
  name: string;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText =
    fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

  if (!jsonText.trim()) {
    throw new Error("AI response did not contain JSON");
  }

  return JSON.parse(jsonText);
}

function getResponseText(result: AnthropicMessageResponse): string {
  return (
    result.content
      ?.map((item) => (item.type === "text" || !item.type ? item.text ?? "" : ""))
      .join("\n")
      .trim() ?? ""
  );
}

function encodeGridCells(cells: Uint8Array): string {
  return Buffer.from(cells).toString("base64");
}

export function buildSpritePrompt(
  userPrompt: string,
  width: number,
  height: number
): string {
  const maxSpriteWidth = Math.min(width, 64);
  const maxSpriteHeight = Math.min(height, 64);

  return `次の内容を体育祭パネル用のピクセルアートsprite DSLで描いてください。

お題:
${userPrompt}

出力先グリッド:
- 幅: ${width}
- 高さ: ${height}

使用できる色インデックス:
- 0: 白（背景・余白）
- 1: 黄
- 2: 赤
- 3: 黒
- 4: 青

制約:
- sprite.width は 1 以上 ${maxSpriteWidth} 以下。
- sprite.height は 1 以上 ${maxSpriteHeight} 以下。
- rows は sprite.height 個の文字列。
- 各 row の文字数は必ず sprite.width。
- palette は1文字の記号を 0〜4 の色インデックスに割り当てる。
- "." は白背景として使う。
- palette に無い文字を rows に入れない。
- 猫・人・動物など有機的な対象は、黒の輪郭と少数色の面で特徴が読めるようにする。
- オレンジ・茶・肌色は黄/赤/白で近似する。

レスポンスはJSONのみ。説明文やMarkdownは不要。

期待するJSON形式:
{
  "name": "短い名前",
  "sprite": {
    "width": 16,
    "height": 12,
    "palette": {
      ".": 0,
      "K": 3,
      "Y": 1,
      "R": 2,
      "B": 4
    },
    "rows": [
      "................"
    ]
  }
}`;
}

export async function generateAiSpriteGrid({
  apiKey,
  prompt,
  gridWidth,
  gridHeight,
}: {
  apiKey: string;
  prompt: string;
  gridWidth: number;
  gridHeight: number;
}): Promise<AiSpriteResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 8192,
      system:
        "You are a careful pixel artist. Return valid JSON only and obey every sprite dimension constraint exactly.",
      messages: [
        {
          role: "user",
          content: buildSpritePrompt(prompt, gridWidth, gridHeight),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${errorText}`);
  }

  const result = (await response.json()) as AnthropicMessageResponse;
  const parsed = extractJson(getResponseText(result));
  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const sprite = normalizeSprite(payload.sprite ?? payload);
  const grid = renderSpriteToGrid(sprite, gridWidth, gridHeight);
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  return {
    gridData: encodeGridCells(grid.cells),
    name: name || "AIピクセル",
  };
}
