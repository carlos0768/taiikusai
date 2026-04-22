"use client";

import { useCallback, useRef, useState } from "react";

interface CameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  onClose: () => void;
}

export default function CameraCapture({
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      setError("カメラにアクセスできません");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    stopCamera();
    onCapture(base64);
  }, [stopCamera, onCapture]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  const handleVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && !streamRef.current) {
        void startCamera();
      }
    },
    [startCamera]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-danger mb-4">{error}</p>
            <button
              onClick={handleClose}
              className="text-accent hover:opacity-80"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={handleVideoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 object-cover"
          />
          <div className="flex items-center justify-center gap-6 p-4 bg-black/80">
            <button
              onClick={handleClose}
              className="text-muted hover:text-foreground text-sm px-4 py-2"
            >
              キャンセル
            </button>
            <button
              onClick={handleCapture}
              disabled={!ready}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 disabled:opacity-30 transition-colors"
            />
          </div>
        </>
      )}
    </div>
  );
}
