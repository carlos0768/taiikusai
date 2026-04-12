"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_MAP,
  type ColorIndex,
  type GridData,
  waveChangedColsAt,
  waveSweepMs,
} from "@/lib/grid/types";

interface Props {
  before: GridData;
  after: GridData;
  beforeMs: number;
  afterMs: number;
  speedColPerSec: number;
  onClose: () => void;
}

/**
 * エディタ画面内でウェーブパネルをプレビュー再生するフルスクリーンオーバーレイ。
 * 流れ: 素地表示 (beforeMs) → 列単位伝播 (width / speedColPerSec 秒) → 適用後表示 (afterMs)
 */
export default function WavePreviewOverlay({
  before,
  after,
  beforeMs,
  afterMs,
  speedColPerSec,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [restartKey, setRestartKey] = useState(0);
  // 完了した restartKey を覚えておく。done = (doneKey === restartKey)
  const [doneKey, setDoneKey] = useState<number | null>(null);
  const done = doneKey === restartKey;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const cellSize = Math.min(
      rect.width / before.width,
      rect.height / before.height
    );
    const canvasW = before.width * cellSize;
    const canvasH = before.height * cellSize;

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = canvasW / before.width;
    const cellH = canvasH / before.height;
    const sweepMs = waveSweepMs(before.width, speedColPerSec);
    const totalMs = beforeMs + sweepMs + afterMs;
    const startTime = performance.now();
    let rafId = 0;
    const currentKey = restartKey;

    const draw = (elapsedMs: number) => {
      const changedCols = waveChangedColsAt(
        {
          kind: "wave",
          before,
          after,
          beforeMs,
          afterMs,
          speedColPerSec,
          name: "",
        },
        elapsedMs
      );

      for (let y = 0; y < before.height; y++) {
        for (let x = 0; x < before.width; x++) {
          const grid = x < changedCols ? after : before;
          const colorIdx = grid.cells[y * grid.width + x] as ColorIndex;
          ctx.fillStyle = COLOR_MAP[colorIdx];
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
      // Grid lines
      ctx.strokeStyle = "rgba(128,128,128,0.15)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= before.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, canvasH);
        ctx.stroke();
      }
      for (let y = 0; y <= before.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(canvasW, y * cellH);
        ctx.stroke();
      }
    };

    const tick = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= totalMs) {
        draw(totalMs);
        setDoneKey(currentKey);
        return;
      }
      draw(elapsed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [before, after, beforeMs, afterMs, speedColPerSec, restartKey]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <span className="text-sm text-foreground">
          ウェーブ プレビュー
          <span className="ml-2 text-xs text-muted">
            {speedColPerSec} 列/秒
          </span>
        </span>
        <div className="flex items-center gap-2">
          {done && (
            <button
              onClick={() => setRestartKey((k) => k + 1)}
              className="px-3 py-1 text-xs bg-accent text-black rounded hover:opacity-90"
            >
              ▶ もう一度
            </button>
          )}
          <button
            onClick={onClose}
            className="text-foreground text-xl px-3 py-1 hover:text-accent"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} />
      </div>
    </div>
  );
}
