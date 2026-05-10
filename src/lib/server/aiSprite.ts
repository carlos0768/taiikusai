import {
  createPanelPaletteDataUrl,
  encodePanelGrid,
  imageBufferToPanelGrid,
} from "@/lib/server/panelImage";

const RD_PLUS_VERSION =
  "7316f27532a7faf1d7e841576fab2c5db712cbf729267a3143ebc60aef357962";
const REPLICATE_API_BASE = "https://api.replicate.com/v1";

type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "canceled"
  | "failed";

interface ReplicatePrediction {
  id?: string;
  error?: string | null;
  logs?: string;
  output?: string | string[] | null;
  status?: PredictionStatus;
  urls?: {
    get?: string;
  };
}

export interface AiSpriteResult {
  gridData: string;
  imageUrl?: string;
  name: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readErrorBody(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Fall through to raw text.
  }

  return text.slice(0, 800);
}

function modelDimension(target: number, scale: number): number {
  const raw = Math.max(64, Math.min(384, target * scale));
  return Math.max(16, Math.min(384, Math.round(raw / 16) * 16));
}

function chooseModelDimensions(gridWidth: number, gridHeight: number): {
  width: number;
  height: number;
} {
  const maxGridSide = Math.max(gridWidth, gridHeight);
  const scale = Math.max(2, Math.min(8, Math.floor(384 / maxGridSide)));

  return {
    width: modelDimension(gridWidth, scale),
    height: modelDimension(gridHeight, scale),
  };
}

function buildImagePrompt(prompt: string): string {
  return [
    `Subject: ${prompt}`,
    "single centered pixel art sprite, full subject visible",
    "bold black outline, readable silhouette, high contrast",
    "limited five color sports-panel palette: white background, yellow/gold, red/orange, black, blue",
    "simple shading, no text, no letters, no watermark, no frame",
  ].join(". ");
}

function buildName(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "AIピクセル";
  return normalized.length > 18
    ? `${normalized.slice(0, 18)}...`
    : normalized;
}

function getOutputUrl(prediction: ReplicatePrediction): string {
  const output = prediction.output;
  const url = Array.isArray(output) ? output.find(Boolean) : output;

  if (!url) {
    throw new Error("Replicate did not return an image URL");
  }

  return url;
}

async function requestPrediction({
  apiKey,
  prompt,
  gridWidth,
  gridHeight,
}: {
  apiKey: string;
  prompt: string;
  gridWidth: number;
  gridHeight: number;
}): Promise<ReplicatePrediction> {
  const imageSize = chooseModelDimensions(gridWidth, gridHeight);
  const paletteDataUrl = await createPanelPaletteDataUrl();
  const modelVersion = process.env.REPLICATE_RD_PLUS_VERSION ?? RD_PLUS_VERSION;

  const response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Cancel-After": "90s",
      "Content-Type": "application/json",
      Prefer: "wait=45",
    },
    body: JSON.stringify({
      version: modelVersion,
      input: {
        prompt: buildImagePrompt(prompt),
        style: "classic",
        width: imageSize.width,
        height: imageSize.height,
        num_images: 1,
        remove_bg: true,
        input_palette: paletteDataUrl,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Replicate API error (${response.status}): ${readErrorBody(
        await response.text()
      )}`
    );
  }

  return (await response.json()) as ReplicatePrediction;
}

async function fetchPrediction(
  apiKey: string,
  url: string
): Promise<ReplicatePrediction> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Replicate polling error (${response.status}): ${readErrorBody(
        await response.text()
      )}`
    );
  }

  return (await response.json()) as ReplicatePrediction;
}

async function waitForPrediction(
  apiKey: string,
  initial: ReplicatePrediction
): Promise<ReplicatePrediction> {
  let prediction = initial;
  const deadline = Date.now() + 90_000;

  while (
    prediction.status === "starting" ||
    prediction.status === "processing" ||
    !prediction.status
  ) {
    if (Date.now() >= deadline) {
      throw new Error("Replicate prediction timed out");
    }

    if (!prediction.urls?.get) {
      throw new Error("Replicate did not return a polling URL");
    }

    await sleep(1800);
    prediction = await fetchPrediction(apiKey, prediction.urls.get);
  }

  if (prediction.status !== "succeeded") {
    const reason = prediction.error ?? prediction.logs ?? prediction.status;
    throw new Error(`Replicate prediction failed: ${reason}`);
  }

  return prediction;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const [, data] = url.split(",", 2);
    if (!data) throw new Error("Invalid data URL returned by Replicate");
    return Buffer.from(data, "base64");
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch generated image (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
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
  const prediction = await waitForPrediction(
    apiKey,
    await requestPrediction({ apiKey, prompt, gridWidth, gridHeight })
  );
  const imageUrl = getOutputUrl(prediction);
  const imageBuffer = await fetchImageBuffer(imageUrl);
  const grid = await imageBufferToPanelGrid(imageBuffer, gridWidth, gridHeight);

  return {
    gridData: encodePanelGrid(grid),
    imageUrl,
    name: buildName(prompt),
  };
}
