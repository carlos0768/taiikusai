"use client";

import { useEffect, useRef, useState } from "react";

interface MusicWaveformProps {
  audioUrl: string | null;
  duration: number;
  pxPerSecond: number;
  width: number;
  height: number;
  bpm?: number | null;
  bpmOffsetSec?: number | null;
}

interface PeakLayer {
  min: Float32Array;
  max: Float32Array;
}

interface PeakData {
  full: PeakLayer;
  low: PeakLayer;
  high: PeakLayer;
  peakAbs: Float32Array;
}

const LOW_PASS_CUTOFF_HZ = 180;
const peakCache = new Map<string, PeakData>();

async function extractPeaks(
  audioUrl: string,
  targetPeakCount: number
): Promise<PeakData> {
  const cacheKey = `${audioUrl}::${targetPeakCount}`;
  const cached = peakCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error("Failed to fetch audio");
  const buffer = await response.arrayBuffer();

  const AudioCtor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtor();
  try {
    const audioBuffer = await ctx.decodeAudioData(buffer);
    const channels = Array.from(
      { length: Math.min(audioBuffer.numberOfChannels, 2) },
      (_, channelIndex) => audioBuffer.getChannelData(channelIndex)
    );
    const sampleCount = audioBuffer.length;
    const samplesPerPeak = Math.max(
      1,
      Math.floor(sampleCount / Math.max(1, targetPeakCount))
    );
    const peakCount = Math.ceil(sampleCount / samplesPerPeak);
    const fullMin = new Float32Array(peakCount);
    const fullMax = new Float32Array(peakCount);
    const lowMin = new Float32Array(peakCount);
    const lowMax = new Float32Array(peakCount);
    const highMin = new Float32Array(peakCount);
    const highMax = new Float32Array(peakCount);
    const peakAbs = new Float32Array(peakCount);
    const lowPassAlpha =
      1 - Math.exp((-2 * Math.PI * LOW_PASS_CUTOFF_HZ) / audioBuffer.sampleRate);
    let lowValue = 0;

    for (let i = 0; i < peakCount; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, sampleCount);
      let fullLo = 0;
      let fullHi = 0;
      let lowLo = 0;
      let lowHi = 0;
      let highLo = 0;
      let highHi = 0;
      let absHi = 0;

      for (let j = start; j < end; j++) {
        const sample =
          channels.length === 1
            ? channels[0][j]
            : (channels[0][j] + channels[1][j]) / 2;
        lowValue += lowPassAlpha * (sample - lowValue);
        const highValue = sample - lowValue;

        if (sample < fullLo) fullLo = sample;
        if (sample > fullHi) fullHi = sample;
        if (lowValue < lowLo) lowLo = lowValue;
        if (lowValue > lowHi) lowHi = lowValue;
        if (highValue < highLo) highLo = highValue;
        if (highValue > highHi) highHi = highValue;
        absHi = Math.max(absHi, Math.abs(sample));
      }

      fullMin[i] = fullLo;
      fullMax[i] = fullHi;
      lowMin[i] = lowLo;
      lowMax[i] = lowHi;
      highMin[i] = highLo;
      highMax[i] = highHi;
      peakAbs[i] = absHi;
    }
    const data: PeakData = {
      full: { min: fullMin, max: fullMax },
      low: { min: lowMin, max: lowMax },
      high: { min: highMin, max: highMax },
      peakAbs,
    };
    peakCache.set(cacheKey, data);
    return data;
  } finally {
    void ctx.close();
  }
}

function maxAbs(layer: PeakLayer) {
  let value = 0;
  for (let i = 0; i < layer.max.length; i++) {
    value = Math.max(value, Math.abs(layer.min[i]), Math.abs(layer.max[i]));
  }
  return Math.max(0.001, value);
}

function peakIndexForX(x: number, width: number, peakCount: number) {
  return Math.min(peakCount - 1, Math.floor((x / width) * peakCount));
}

function drawLayer({
  ctx,
  layer,
  width,
  mid,
  amp,
  normalizeBy,
  fillStyle,
}: {
  ctx: CanvasRenderingContext2D;
  layer: PeakLayer;
  width: number;
  mid: number;
  amp: number;
  normalizeBy: number;
  fillStyle: string;
}) {
  const peakCount = layer.max.length;
  const drawWidth = Math.ceil(width);
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let x = 0; x <= drawWidth; x++) {
    const idx = peakIndexForX(x, width, peakCount);
    ctx.lineTo(x, mid - (layer.max[idx] / normalizeBy) * amp);
  }
  for (let x = drawWidth; x >= 0; x--) {
    const idx = peakIndexForX(x, width, peakCount);
    ctx.lineTo(x, mid - (layer.min[idx] / normalizeBy) * amp);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPeakHighlights(
  ctx: CanvasRenderingContext2D,
  peaks: PeakData,
  width: number,
  height: number,
  normalizeBy: number
) {
  const peakCount = peaks.peakAbs.length;
  const mid = height / 2;
  const drawWidth = Math.ceil(width);
  for (let x = 0; x <= drawWidth; x++) {
    const idx = peakIndexForX(x, width, peakCount);
    const level = peaks.peakAbs[idx] / normalizeBy;
    if (level < 0.72) continue;

    const alpha = Math.min(0.86, (level - 0.72) / 0.28);
    const halfHeight = Math.min(height * 0.48, level * height * 0.45);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = alpha > 0.55 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, mid - halfHeight);
    ctx.lineTo(x + 0.5, mid + halfHeight);
    ctx.stroke();
  }
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  duration: number,
  pxPerSecond: number,
  bpm: number | null | undefined,
  bpmOffsetSec: number | null | undefined
) {
  if (!bpm || bpm <= 0 || duration <= 0) return;

  const beatIntervalSec = 60 / bpm;
  const offset = bpmOffsetSec ?? 0;
  const firstBeatIdx = Math.ceil(-offset / beatIntervalSec);
  const startBeat = Math.max(0, firstBeatIdx);

  for (let i = startBeat; ; i++) {
    const t = offset + i * beatIntervalSec;
    if (t > duration) break;
    const x = Math.round(t * pxPerSecond) + 0.5;
    if (x < 0 || x > width) continue;

    const isBarStart = i % 4 === 0;
    ctx.strokeStyle = isBarStart
      ? "rgba(255, 255, 255, 0.82)"
      : "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = isBarStart ? 1.5 : 0.75;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    if (isBarStart) {
      ctx.fillStyle = "#ff2d2d";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 5, 7);
      ctx.lineTo(x + 5, 7);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x - 5, height - 7);
      ctx.lineTo(x + 5, height - 7);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export default function MusicWaveform({
  audioUrl,
  duration,
  pxPerSecond,
  width,
  height,
  bpm,
  bpmOffsetSec,
}: MusicWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<PeakData | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);

  useEffect(() => {
    if (!audioUrl || duration <= 0) {
      const resetId = window.setTimeout(() => {
        setPeaks(null);
        setDecoding(false);
        setDecodeFailed(false);
      }, 0);
      return () => window.clearTimeout(resetId);
    }
    let cancelled = false;
    const targetPeakCount = Math.min(
      240_000,
      Math.max(512, Math.round(duration * pxPerSecond * 2))
    );
    const decodeId = window.setTimeout(() => {
      if (cancelled) return;
      setDecoding(true);
      setDecodeFailed(false);
      extractPeaks(audioUrl, targetPeakCount)
        .then((data) => {
          if (cancelled) return;
          setPeaks(data);
        })
        .catch(() => {
          if (cancelled) return;
          setDecodeFailed(true);
        })
        .finally(() => {
          if (cancelled) return;
          setDecoding(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(decodeId);
    };
  }, [audioUrl, duration, pxPerSecond]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;

    if (peaks && peaks.full.max.length > 0) {
      const fullNorm = maxAbs(peaks.full);
      const lowNorm = maxAbs(peaks.low);
      const highNorm = maxAbs(peaks.high);

      drawLayer({
        ctx,
        layer: peaks.full,
        width,
        mid,
        amp: mid * 0.95,
        normalizeBy: fullNorm,
        fillStyle: "rgba(0, 111, 255, 0.82)",
      });
      drawLayer({
        ctx,
        layer: peaks.high,
        width,
        mid,
        amp: mid * 0.86,
        normalizeBy: highNorm,
        fillStyle: "rgba(0, 98, 218, 0.52)",
      });
      drawLayer({
        ctx,
        layer: peaks.low,
        width,
        mid,
        amp: mid * 0.78,
        normalizeBy: lowNorm,
        fillStyle: "rgba(238, 148, 14, 0.9)",
      });
      drawPeakHighlights(ctx, peaks, width, height, fullNorm);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    drawBeatGrid(ctx, width, height, duration, pxPerSecond, bpm, bpmOffsetSec);
  }, [peaks, width, height, bpm, bpmOffsetSec, duration, pxPerSecond]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
    >
      <canvas ref={canvasRef} className="block" />
      {decoding && !peaks && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-muted/70">
          波形を解析中...
        </div>
      )}
      {decodeFailed && !peaks && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-muted/70">
          波形を表示できませんでした
        </div>
      )}
    </div>
  );
}
