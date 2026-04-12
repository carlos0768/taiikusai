import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import {
  quantizeToIndexGrid,
  uint8ArrayToBase64,
} from "@/lib/scan/quantize";

/**
 * スキャン API (ルート B: gpt-image-1 パイプライン)
 *
 * 1. Claude Vision: 画像から「本質抽出の指示書」を自然言語で生成
 * 2. gpt-image-1 (images.edit): 元画像 + 指示書 + 5 色パレット制約で画像生成
 * 3. sharp: W×H に area-average リサイズ
 * 4. LAB 量子化で 5 色 ColorIndex grid に変換
 *
 * LLM 2 段で「①意味判断 = Claude が言語で抽出、②ピクセル化 = gpt-image-1 が描画」
 * という分業を厳密に検証するルート。SVG パイプライン (ルート A) と並行で評価する。
 */

export const runtime = "nodejs";

const NL_PROMPT = (W: number, H: number): string =>
  `この画像を、体育祭のパネル競技 (${W}×${H} セル、色は白・黄・赤・黒・青の 5 色のみ) に変換するための「抽出指示書」を書いてください。

以下の項目を含む、簡潔な日本語の指示書を作成してください:
1. 主題は何か (例: 人物の顔、花、ロゴ、建物)
2. 構図 (中央に主題、上下に帯、左右対称、etc)
3. 色の割り当て (背景=黒、主題のハイライト=黄、影=赤、etc)
4. 省略すべき細部 (背景のテクスチャ、細かい文字、細部の装飾)
5. 強調すべき特徴 (顔の輪郭、目、髪、シルエットの外形)

${W}×${H} という低解像度で識別可能な形として表現するための指示にしてください。
出力は指示書の本文のみ。マークダウンや前置きは不要です。`;

const IMAGE_EDIT_PROMPT = (
  nlInstruction: string,
  W: number,
  H: number
): string =>
  `${nlInstruction}

---

Render the above as pixel art for a sports festival stand performance panel.
Target aspect ratio: ${W}:${H}.

Strict color constraints — use ONLY these 5 colors, no gradients, no anti-aliasing, no intermediate shades:
- #FFFFFF (white)
- #FFD700 (yellow)
- #FF0000 (red)
- #000000 (black)
- #0000FF (blue)

Background: solid black. Bold, simplified shapes with hard edges. Flat shading only.
No text, no fine details, no photorealism. Think retro 8-bit stadium card display.`;

interface ScanRequestBody {
  image?: unknown;
  gridWidth?: unknown;
  gridHeight?: unknown;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  // ──────────────────────────────────────────
  // Step 1: Claude Vision → 自然言語の抽出指示書
  // ──────────────────────────────────────────
  let nlInstruction: string;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
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
              { type: "text", text: NL_PROMPT(W, H) },
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

    const result = (await response.json()) as AnthropicResponse;
    nlInstruction = result.content?.[0]?.text?.trim() ?? "";
    if (!nlInstruction) {
      return NextResponse.json(
        { error: "Claude returned empty instruction" },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Claude request failed: ${String(err)}` },
      { status: 500 }
    );
  }

  // ──────────────────────────────────────────
  // Step 2: gpt-image-1 (images.edit) で画像生成
  // ──────────────────────────────────────────
  let generatedPngB64: string;
  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    // 元画像 (base64 JPEG) を File-like にラップ
    const inputBuffer = Buffer.from(image, "base64");
    const inputFile = await toFile(inputBuffer, "input.jpg", {
      type: "image/jpeg",
    });

    // パネルのアスペクト比に最も近いサイズを選ぶ
    // gpt-image-1 は 1024x1024 / 1024x1536 / 1536x1024 をサポート
    const size: "1024x1024" | "1024x1536" | "1536x1024" =
      W > H ? "1536x1024" : W < H ? "1024x1536" : "1024x1024";

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: inputFile,
      prompt: IMAGE_EDIT_PROMPT(nlInstruction, W, H),
      size,
      quality: "high",
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        {
          error: "gpt-image-1 returned no image data",
          debug: { nlInstruction },
        },
        { status: 500 }
      );
    }
    generatedPngB64 = b64;
  } catch (err) {
    return NextResponse.json(
      {
        error: `gpt-image-1 request failed: ${String(err)}`,
        debug: { nlInstruction },
      },
      { status: 500 }
    );
  }

  // ──────────────────────────────────────────
  // Step 3: sharp で W×H にリサイズ + RGBA raw pixels 取得
  // ──────────────────────────────────────────
  let rgba: Buffer;
  try {
    const pngBuffer = Buffer.from(generatedPngB64, "base64");
    const { data } = await sharp(pngBuffer)
      .ensureAlpha()
      .resize(W, H, {
        fit: "cover",
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    rgba = data;
  } catch (err) {
    return NextResponse.json(
      {
        error: `Image post-processing failed: ${String(err)}`,
        debug: { nlInstruction, generatedImagePngBase64: generatedPngB64 },
      },
      { status: 500 }
    );
  }

  // ──────────────────────────────────────────
  // Step 4: LAB 量子化で 5 色 ColorIndex grid へ
  //  (sharp が既に W×H に resize 済みなので、src=dst の恒等変換)
  // ──────────────────────────────────────────
  let grid: Uint8Array;
  try {
    grid = quantizeToIndexGrid(rgba, W, H, W, H, 4);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Quantization failed: ${String(err)}`,
        debug: { nlInstruction, generatedImagePngBase64: generatedPngB64 },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    gridData: uint8ArrayToBase64(grid),
    debug: {
      nlInstruction,
      generatedImagePngBase64: generatedPngB64,
    },
  });
}
