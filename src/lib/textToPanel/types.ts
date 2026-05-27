import type { ColorIndex } from "@/lib/grid/types";

export const PANEL_DSL_ELEMENT_KINDS = [
  "rect",
  "ellipse",
  "line",
  "polygon",
  "text",
] as const;

export type PanelDslElementKind = (typeof PANEL_DSL_ELEMENT_KINDS)[number];

export interface PanelDslElement {
  kind: PanelDslElementKind;
  color: ColorIndex;
  box: [number, number, number, number];
  strokeWidth: number;
  text: string;
  points: Array<[number, number]>;
}

export interface PanelDsl {
  title: string;
  assistantMessage: string;
  background: ColorIndex;
  elements: PanelDslElement[];
}

interface UnknownRecord {
  [key: string]: unknown;
}

const COLOR_INDEXES = new Set([0, 1, 2, 3, 4]);
const ELEMENT_KINDS = new Set<string>(PANEL_DSL_ELEMENT_KINDS);
const MAX_ELEMENTS = 48;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isColorIndex(value: unknown): value is ColorIndex {
  return typeof value === "number" && Number.isInteger(value) && COLOR_INDEXES.has(value);
}

function normalizeColor(
  value: unknown,
  fallback: ColorIndex,
  warnings: string[],
  label: string
): ColorIndex {
  if (isColorIndex(value)) return value;
  warnings.push(`${label} の色が不正だったため ${fallback} に補正しました`);
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBox(value: unknown, warnings: string[], label: string) {
  if (!Array.isArray(value)) {
    warnings.push(`${label} の box が不正だったため初期値に補正しました`);
    return [0, 0, 1, 1] as [number, number, number, number];
  }

  return [
    normalizeNumber(value[0], 0),
    normalizeNumber(value[1], 0),
    normalizeNumber(value[2], 1),
    normalizeNumber(value[3], 1),
  ] as [number, number, number, number];
}

function normalizePoints(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((point) => {
    if (!Array.isArray(point)) return [];
    return [[normalizeNumber(point[0], 0), normalizeNumber(point[1], 0)] as [number, number]];
  });
}

function normalizeElement(
  value: unknown,
  index: number,
  warnings: string[]
): PanelDslElement | null {
  if (!isRecord(value)) {
    warnings.push(`要素 ${index + 1} が不正だったため除外しました`);
    return null;
  }

  const kind = typeof value.kind === "string" ? value.kind : "";
  if (!ELEMENT_KINDS.has(kind)) {
    warnings.push(`要素 ${index + 1} の kind が不正だったため除外しました`);
    return null;
  }

  return {
    kind: kind as PanelDslElementKind,
    color: normalizeColor(value.color, 3, warnings, `要素 ${index + 1}`),
    box: normalizeBox(value.box, warnings, `要素 ${index + 1}`),
    strokeWidth: Math.max(0.25, normalizeNumber(value.strokeWidth, 1)),
    text: typeof value.text === "string" ? value.text : "",
    points: normalizePoints(value.points),
  };
}

export function normalizePanelDsl(input: unknown): {
  dsl: PanelDsl;
  warnings: string[];
} {
  const warnings: string[] = [];
  const source = isRecord(input) ? input : {};

  if (!isRecord(input)) {
    warnings.push("DSL全体が不正だったため空のパネルとして扱いました");
  }

  const rawElements = Array.isArray(source.elements) ? source.elements : [];
  if (rawElements.length > MAX_ELEMENTS) {
    warnings.push(`要素数が多すぎるため先頭 ${MAX_ELEMENTS} 件だけ使用しました`);
  }

  const elements = rawElements
    .slice(0, MAX_ELEMENTS)
    .flatMap((element, index) => {
      const normalized = normalizeElement(element, index, warnings);
      return normalized ? [normalized] : [];
    });

  return {
    dsl: {
      title:
        typeof source.title === "string" && source.title.trim()
          ? source.title.trim()
          : "生成パネル",
      assistantMessage:
        typeof source.assistantMessage === "string" && source.assistantMessage.trim()
          ? source.assistantMessage.trim()
          : "パネル案を生成しました。",
      background: normalizeColor(source.background, 0, warnings, "背景"),
      elements,
    },
    warnings,
  };
}
