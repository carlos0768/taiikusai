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

interface PeakData {
  min: Float32Array;
  max: Float32Array;
}

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
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.max(
      1,
      Math.floor(channelData.length / Math.max(1, targetPeakCount))
    );
    const peakCount = Math.ceil(channelData.length / samplesPerPeak);
    const min = new Float32Array(peakCount);
    const max = new Float32Array(peakCount);
    for (let i = 0; i < peakCount; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);
      let lo = 0;
      let hi = 0;
      for (let j = start; j < end; j++) {
        const v = channelData[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[i] = lo;
      max[i] = hi;
    }
    const data: PeakData = { min, max };
    peakCache.set(cacheKey, data);
    return data;
  } finally {
    void ctx.close();
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
      setPeaks(null);
      setDecodeFailed(false);
      return;
    }
    let cancelled = false;
    setDecoding(true);
    setDecodeFailed(false);
    // Aim for ~2 peaks per pixel so the rendering looks dense.
    const targetPeakCount = Math.min(
      200_000,
      Math.max(512, Math.round(duration * pxPerSecond * 2))
    );
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
    return () => {
      cancelled = true;
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

    if (peaks && peaks.max.length > 0) {
      const peakCount = peaks.max.length;
      const amp = mid * 0.95;

      ctx.fillStyle = "rgba(232, 158, 88, 0.85)";
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let x = 0; x < width; x++) {
        const idx = Math.min(
          peakCount - 1,
          Math.floor((x / width) * peakCount)
        );
        const v = peaks.max[idx] || 0;
        ctx.lineTo(x, mid - v * amp);
      }
      for (let x = width - 1; x >= 0; x--) {
        const idx = Math.min(
          peakCount - 1,
          Math.floor((x / width) * peakCount)
        );
        const v = peaks.min[idx] || 0;
        ctx.lineTo(x, mid - v * amp);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
    }

    if (bpm && bpm > 0 && duration > 0) {
      const beatIntervalSec = 60 / bpm;
      const offset = bpmOffsetSec ?? 0;
      const firstBeatIdx = Math.ceil(-offset / beatIntervalSec);
      const startBeat = Math.max(0, firstBeatIdx);
      for (let i = startBeat; ; i++) {
        const t = offset + i * beatIntervalSec;
        if (t > duration) break;
        const x = Math.round(t * pxPerSecond) + 0.5;
        const isDownbeat = i % 4 === 0;
        if (isDownbeat) {
          ctx.strokeStyle = "rgba(255, 215, 0, 0.7)";
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
          ctx.lineWidth = 0.5;
        }
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
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
