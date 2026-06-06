import { anthropic } from "@ai-sdk/anthropic";

export function isMastraMockEnabled(): boolean {
  return process.env.MASTRA_MOCK === "1";
}

export const aiModel = () =>
  anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5");
