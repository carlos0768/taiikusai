import { NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import {
  quantizeToIndexGrid,
  uint8ArrayToBase64,
} from "@/lib/scan/quantize";

/**
 * スキャン API (ルート A: SVG パイプライン)
 *
 * 1. Claude Vision に画像を送り、viewBox=0 0 W H の SVG を吐かせる
 * 2. @resvg/resvg-js で W×H のオーバーサンプル解像度にラスタライズ
 * 3. LAB 距離で 5 色パレットに量子化して ColorIndex grid を返す
 *
 * LLM は「形の意味判断」だけを担当し、マス目のカウントはしない。
 * ラスタライズと色量子化は完全に決定論的。
 */

export const runtime = "nodejs";

const SVG_PROMPT = (W: number, H: number): string =>
  `この画像の本質を抽出し、体育祭のパネル競技用のデザインとして SVG で出力してください。

制約:
- 最外要素: <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
- fill / stroke は以下の 5 色のみ使用可能:
  #FFFFFF (白), #FFD700 (黄), #FF0000 (赤), #000000 (黒), #0000FF (青)
- 最初に <rect fill="#000000" width="${W}" height="${H}"/> で背景を黒で埋める
- 使用要素: rect, circle, ellipse, polygon, path
- ${W}×${H} セルの低解像度でも主題が識別可能なレベルまで大胆に簡略化すること
- テキスト、フォント、細かすぎる形状は禁止
- stroke-width は 1 以上の整数
- 出力は SVG コードのみ。説明・マークダウン・コードフェンス不要。`;

/** 1 セルあたり OVERSAMPLE×OVERSAMPLE ピクセルでラスタライズしてから平均化 */
const OVERSAMPLE = 16;

/** Claude のレスポンステキストから <svg>...</svg> 部分を抽出 */
function extractSvg(text: string): string | null {
  // コードフェンスを除去 (```svg / ```xml / ``` いずれも)
  const cleaned = text
    .replace(/```(?:svg|xml|html)?\s*/gi, "")
    .replace(/```/g, "");
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

interface ScanRequestBody {
  image?: unknown;
  gridWidth?: unknown;
  gridHeight?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScanRequestBody;
  const image = typeof body.image === "string" ? body.image : "";
  const W = Number(body.gridWidth);
  const H = Number(body.gridHeight);

  if (!image) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) {
    return NextResponse.json(
      { error: "Invalid grid dimensions" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // 1. Claude Vision に SVG を吐かせる
  let claudeText: string;
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
              { type: "text", text: SVG_PROMPT(W, H) },
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
    claudeText = result.content?.[0]?.text ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: `Claude request failed: ${String(err)}` },
      { status: 500 }
    );
  }

  // 2. SVG を抽出
  const svg = extractSvg(claudeText);
  if (!svg) {
    return NextResponse.json(
      {
        error: "Failed to extract SVG from Claude response",
        debug: { rawResponse: claudeText },
      },
      { status: 500 }
    );
  }

  // 3. resvg でラスタライズ (オーバーサンプル)
  let pixels: Uint8Array;
  let rasterWidth: number;
  let rasterHeight: number;
  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: W * OVERSAMPLE },
      background: "#000000",
    });
    const rendered = resvg.render();
    pixels = rendered.pixels;
    rasterWidth = rendered.width;
    rasterHeight = rendered.height;
  } catch (err) {
    return NextResponse.json(
      {
        error: `SVG rasterization failed: ${String(err)}`,
        debug: { svg },
      },
      { status: 500 }
    );
  }

  // 4. W×H の ColorIndex grid に量子化 (RGBA → area-average → LAB 最近傍)
  let grid: Uint8Array;
  try {
    grid = quantizeToIndexGrid(pixels, rasterWidth, rasterHeight, W, H, 4);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Quantization failed: ${String(err)}`,
        debug: { svg },
      },
      { status: 500 }
    );
  }

  // 5. base64 で返却 (debug にも SVG を含める)
  return NextResponse.json({
    gridData: uint8ArrayToBase64(grid),
    debug: { svg },
  });
}
