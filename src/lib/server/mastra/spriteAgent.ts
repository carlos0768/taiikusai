import { Agent } from "@mastra/core/agent";
import { z } from "zod/v4";
import { aiModel, isMastraMockEnabled } from "./index";

const colorIndexSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const spriteSchema = z.object({
  name: z.string().max(40).optional(),
  sprite: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    palette: z.record(z.string().min(1), colorIndexSchema),
    rows: z.array(z.string()).min(1),
  }),
});

export type SpriteAgentObject = z.infer<typeof spriteSchema>;

interface GenerateSpriteCandidateInput {
  message: string;
  gridWidth: number;
  gridHeight: number;
  iteration: number;
}

let spriteAgent: Agent | null = null;

function getSpriteAgent() {
  if (!spriteAgent) {
    spriteAgent = new Agent({
      id: "sprite-agent",
      name: "Sprite Agent",
      instructions:
        "You are a careful pixel artist for Japanese sports festival panel art. Return valid JSON only and obey every sprite dimension and palette constraint exactly.",
      model: aiModel(),
    });
  }

  return spriteAgent;
}

export async function generateSpriteCandidate({
  message,
  gridWidth,
  gridHeight,
  iteration,
}: GenerateSpriteCandidateInput): Promise<SpriteAgentObject> {
  if (isMastraMockEnabled()) {
    return makeMockSprite(gridWidth, gridHeight, iteration);
  }

  const result = await getSpriteAgent().generate(message, {
    structuredOutput: {
      schema: spriteSchema,
    },
    modelSettings: {
      maxOutputTokens: 4096,
    },
    maxSteps: 1,
  });

  if (result.error) {
    throw result.error;
  }

  return result.object;
}

function makeMockSprite(
  gridWidth: number,
  gridHeight: number,
  iteration: number
): SpriteAgentObject {
  const width = Math.max(1, Math.min(gridWidth, 8));
  const height = Math.max(1, Math.min(gridHeight, 8));
  const improved = iteration > 1;

  return {
    name: improved ? "モック高精度" : "モック試作",
    sprite: {
      width,
      height,
      palette: {
        ".": 0,
        K: 3,
        R: 2,
        Y: 1,
        B: 4,
      },
      rows: Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => {
          if (improved) {
            return x === 0 || y === 0 || x === width - 1 || y === height - 1
              ? "K"
              : "R";
          }

          return x === Math.floor(width / 2) || y === Math.floor(height / 2)
            ? "R"
            : ".";
        }).join("")
      ),
    },
  };
}
