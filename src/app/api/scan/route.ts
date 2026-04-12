import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { image, gridWidth, gridHeight } = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const prompt = `この画像を${gridWidth}列×${gridHeight}行のグリッドに変換してください。

各セルは以下の色インデックスのいずれかです:
- 0: 白
- 1: 黄色
- 2: 赤
- 3: 黒
- 4: 青

画像の中のデザインを見て、各セルに最も近い色を割り当ててください。

レスポンスはJSON形式で、"grid"キーに2次元配列（行×列）を返してください。
例: {"grid": [[0,1,2],[3,4,0]]}

JSONのみを返してください。説明は不要です。`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${err}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const text =
      result.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse grid from AI response" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const grid: number[][] = parsed.grid;

    // Convert 2D array to flat Uint8Array then base64
    const cells = new Uint8Array(gridWidth * gridHeight);
    for (let y = 0; y < Math.min(grid.length, gridHeight); y++) {
      for (let x = 0; x < Math.min(grid[y]?.length ?? 0, gridWidth); x++) {
        const val = grid[y][x];
        cells[y * gridWidth + x] = Math.max(0, Math.min(4, val));
      }
    }

    let binary = "";
    for (let i = 0; i < cells.length; i++) {
      binary += String.fromCharCode(cells[i]);
    }
    const gridData = btoa(binary);

    return NextResponse.json({ gridData });
  } catch (err) {
    return NextResponse.json(
      { error: `Scan failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
