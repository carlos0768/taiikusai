export const DEFAULT_PANEL_DURATION_MS = 2000;
export const DEFAULT_INTERVAL_MS = 1000;
export const MIN_TIMING_MS = 200;
export const MAX_TIMING_MS = 10000;
export const TIMING_STEP_MS = 100;

const TIMING_SCHEMA_COLUMNS = [
  "default_panel_duration_ms",
  "default_interval_ms",
  "panel_duration_override_ms",
  "interval_override_ms",
] as const;

export function clampTimingMs(ms: number): number {
  const rounded = Math.round(ms / TIMING_STEP_MS) * TIMING_STEP_MS;
  return Math.min(MAX_TIMING_MS, Math.max(MIN_TIMING_MS, rounded));
}

export function msToSecondsString(ms: number): string {
  return (clampTimingMs(ms) / 1000).toFixed(1);
}

export function secondsInputToMs(value: string): number | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return clampTimingMs(seconds * 1000);
}

export function getTimingPersistenceErrorMessage(
  error: unknown,
  kind: "frame" | "gap"
): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";

  const isTimingSchemaError = TIMING_SCHEMA_COLUMNS.some((column) =>
    message.includes(column)
  );

  if (isTimingSchemaError) {
    return "時間設定用のDBカラムが未適用です。`supabase/migrations/20260421000000_add_playback_timing_defaults.sql` を適用してください。";
  }

  return kind === "frame"
    ? "表示時間の保存に失敗しました"
    : "折り時間の保存に失敗しました";
}
