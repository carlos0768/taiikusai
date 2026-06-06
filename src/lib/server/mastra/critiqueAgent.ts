import { Agent } from "@mastra/core/agent";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import { z } from "zod/v4";
import { aiModel, isMastraMockEnabled } from "./index";

export const critiqueSchema = z.object({
  score: z.number().int().min(0).max(100),
  issues: z.array(z.string().max(120)).max(6),
  suggestion: z.string().max(400),
});

export type CritiqueResult = z.infer<typeof critiqueSchema>;

interface CritiqueSpriteInput {
  userPrompt: string;
  pngBuffer: Buffer;
  iteration: number;
}

let critiqueAgent: Agent | null = null;

function getCritiqueAgent() {
  if (!critiqueAgent) {
    critiqueAgent = new Agent({
      id: "sprite-critique-agent",
      name: "Sprite Critique Agent",
      instructions:
        "You are a strict, consistent evaluator of sports festival panel pixel art. Evaluate recognition first, then palette fit, composition, and black outline quality. Return concise structured feedback only.",
      model: aiModel(),
    });
  }

  return critiqueAgent;
}

export async function critiqueSprite({
  userPrompt,
  pngBuffer,
  iteration,
}: CritiqueSpriteInput): Promise<CritiqueResult> {
  if (isMastraMockEnabled()) {
    return iteration === 1
      ? {
          score: 60,
          issues: ["輪郭が弱く、遠目の認識性が不足しています"],
          suggestion:
            "黒の輪郭を増やし、対象を中央に大きく配置して特徴を単純化してください。",
        }
      : {
          score: 80,
          issues: [],
          suggestion:
            "認識性と輪郭は十分です。この方向で余白を少しだけ整えてください。",
        };
  }

  const messages: MessageListInput = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: buildCritiquePrompt(userPrompt),
        },
        {
          type: "image",
          image: pngBuffer,
          mediaType: "image/png",
        },
      ],
    },
  ];

  const result = await getCritiqueAgent().generate(messages, {
    structuredOutput: {
      schema: critiqueSchema,
    },
    modelSettings: {
      maxOutputTokens: 1024,
    },
    maxSteps: 1,
  });

  if (result.error) {
    throw result.error;
  }

  return result.object;
}

function buildCritiquePrompt(userPrompt: string): string {
  return `次のPNGは体育祭パネル用の5色ピクセルアートです。お題に対して、遠くから一目で読めるかを厳しく評価してください。

お題:
${userPrompt}

評価軸:
1. 認識性（最重要）: お題の対象が一目で読めるか。
2. パレット適合: 白/黄/赤/黒/青のみで自然に近似できているか。灰色や未定義色に頼る想定は減点。
3. 構図: 余白、中央寄せ、サイズ感が体育祭パネルとして適切か。
4. 黒輪郭: 有機的な対象や複雑な対象で輪郭が識別に機能しているか。

score は 0 から 100 の整数です。75 以上なら本番候補として許容できます。
issues は最大6個、suggestion は次の生成で直すべき具体的な改善指示にしてください。`;
}
