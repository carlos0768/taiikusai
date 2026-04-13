"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  onClose: () => void;
}

/** ライブラリから選んだ画像の最大辺 (px)。大きすぎる元画像は縮小して送る */
const LIBRARY_MAX_DIMENSION = 1600;
/** JPEG エンコード品質 (0.0 〜 1.0) */
const LIBRARY_JPEG_QUALITY = 0.85;

export default function CameraCapture({
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  /**
   * ライブラリ / ファイルから選ばれた画像を JPEG base64 に変換して onCapture。
   * - 長辺を LIBRARY_MAX_DIMENSION に縮小 (アップロードサイズを抑制)
   * - HEIC など canvas で読めない形式は失敗扱いでエラー表示
   */
  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // input を空にしておく (同じファイルを連続で選んでも onChange が発火するように)
      e.target.value = "";
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const longSide = Math.max(img.naturalWidth, img.naturalHeight);
          const scale = longSide > LIBRARY_MAX_DIMENSION
            ? LIBRARY_MAX_DIMENSION / longSide
            : 1;
          const dstW = Math.max(1, Math.round(img.naturalWidth * scale));
          const dstH = Math.max(1, Math.round(img.naturalHeight * scale));

          const canvas = document.createElement("canvas");
          canvas.width = dstW;
          canvas.height = dstH;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, dstW, dstH);

          const base64 = canvas
            .toDataURL("image/jpeg", LIBRARY_JPEG_QUALITY)
            .split(",")[1];
          URL.revokeObjectURL(objectUrl);
          stopCamera();
          onCapture(base64);
        } catch {
          URL.revokeObjectURL(objectUrl);
          setError("画像の読み込みに失敗しました");
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setError(
          "画像を読み込めませんでした (HEIC など一部形式は対応していません)"
        );
      };
      img.src = objectUrl;
    },
    [stopCamera, onCapture]
  );

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Auto-start camera on mount; ensure cleanup on unmount.
  // startCamera is async and only calls setState after awaiting getUserMedia,
  // so it doesn't cause cascading synchronous renders.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col h-[100dvh]">
      {/* ライブラリ用の隠し input (エラー画面でも有効にしたいのでツリー外に置く) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilePick}
        className="hidden"
      />

      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-danger mb-4">{error}</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-accent hover:opacity-80"
              >
                ライブラリから選択
              </button>
              <button
                onClick={handleClose}
                className="text-muted hover:text-foreground"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 min-h-0 object-cover"
          />
          <div className="flex items-center justify-center gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/80">
            <button
              onClick={handleClose}
              className="text-muted hover:text-foreground text-sm px-4 py-2"
            >
              キャンセル
            </button>
            <button
              onClick={handleCapture}
              disabled={!ready}
              aria-label="撮影"
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 disabled:opacity-30 transition-colors"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="ライブラリから選択"
              className="w-12 h-12 flex items-center justify-center rounded-full border border-white/40 text-white/90 hover:bg-white/10 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="M21 15l-5-5L5 19" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
