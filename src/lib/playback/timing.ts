export const DEFAULT_PANEL_DURATION_MS = 2000;
export const DEFAULT_INTERVAL_MS = 1000;
export const MIN_TIMING_MS = 200;
export const MAX_TIMING_MS = 10000;
export const TIMING_STEP_MS = 100;

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
