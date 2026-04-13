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
 * 3. sharp: 彩度ブースト → contain リサイズ (黒パディング) で W×H
 * 4. LAB 量子化で 5 色 ColorIndex grid に変換
 *
 * env SCAN_DEBUG_CANDIDATES=true のときだけ gpt-image-1 を n=3 で叩き、
 * 全候補を debug.candidates に返す (検証用)。本番デフォルトは n=1。
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

Strict color constraints — use ONLY these 5 vivid, fully saturated colors. No gradients, no anti-aliasing, no intermediate shades, no muted tones:
- #FFFFFF pure white
- #FFD700 pure yellow
- #FF0000 pure red
- #000000 pure black
- #0000FF pure blue (vivid primary blue, NOT navy or dark blue)

Background: solid black. Bold, simplified shapes with hard edges. Flat shading only.
No text, no fine details, no photorealism. Think retro 8-bit stadium card display.

IMPORTANT composition rule:
The final display has aspect ratio ${W}:${H}. Compose the subject so that it fits ENTIRELY within this aspect ratio. The subject must NOT be cropped at the edges. Center the subject within the frame, even if the generated canvas itself is wider or taller than the target aspect ratio. Leave generous margin on all sides; prefer having the subject smaller and complete over having it larger but cut off.`;

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

interface Candidate {
  gridData: string;
  generatedImagePngBase64: string;
}

/**
 * 1 枚の生成 PNG (base64) を ColorIndex grid (base64) に変換する。
 *
 * sharp チェーン:
 *   1. ensureAlpha() — α なし PNG にも対応
 *   2. modulate({ saturation: 1.8 }) — 彩度ブースト
 *      gpt-image-1 が鈍い色を出した場合に純色側に寄せる
 *   3. resize(W, H, fit:"contain", bg:black) — アスペクト比を保ったまま
 *      パネル内に主題が完全に収まるよう縮小、余白は黒で埋める
 *   4. raw() → RGBA Buffer
 * その後 quantizeToIndexGrid で LAB → hue ベースの 5 色量子化。
 */
async function processCandidate(
  pngBase64: string,
  W: number,
  H: number
): Promise<Candidate> {
  const pngBuffer = Buffer.from(pngBase64, "base64");
  const { data } = await sharp(pngBuffer)
    .ensureAlpha()
    .modulate({ saturation: 1.8 })
    .resize(W, H, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = quantizeToIndexGrid(data, W, H, W, H, 4);
  return {
    gridData: uint8ArrayToBase64(grid),
    generatedImagePngBase64: pngBase64,
  };
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
  //   - 検証モード時は n=3 で複数候補を取得
  // ──────────────────────────────────────────
  const debugCandidatesMode = process.env.SCAN_DEBUG_CANDIDATES === "true";
  const requestedN = debugCandidatesMode ? 3 : 1;

  let imageEntries: Array<{ b64_json?: string }>;
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
      n: requestedN,
    });

    imageEntries = result.data ?? [];
  } catch (err) {
    return NextResponse.json(
      {
        error: `gpt-image-1 request failed: ${String(err)}`,
        debug: { nlInstruction },
      },
      { status: 500 }
    );
  }

  if (imageEntries.length === 0) {
    return NextResponse.json(
      {
        error: "gpt-image-1 returned no image data",
        debug: { nlInstruction },
      },
      { status: 500 }
    );
  }

  // ──────────────────────────────────────────
  // Step 3+4: 各候補を sharp で後処理 + 量子化
  //   失敗した候補はスキップし、全滅したらエラー返却
  // ──────────────────────────────────────────
  const candidates: Candidate[] = [];
  for (const entry of imageEntries) {
    const b64 = entry.b64_json;
    if (!b64) continue;
    try {
      const c = await processCandidate(b64, W, H);
      candidates.push(c);
    } catch (err) {
      // 個別候補の失敗は致命ではない。最低 1 つ通れば OK
      console.error("scan: candidate post-processing failed", err);
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error: "All candidates failed post-processing",
        debug: { nlInstruction },
      },
      { status: 500 }
    );
  }

  // 互換: 既存呼び出し側は debug.generatedImagePngBase64 と gridData を見ている
  // 検証モード時のみ debug.candidates に全候補を追加
  return NextResponse.json({
    gridData: candidates[0].gridData,
    debug: {
      nlInstruction,
      generatedImagePngBase64: candidates[0].generatedImagePngBase64,
      ...(debugCandidatesMode ? { candidates } : {}),
    },
  });
}
