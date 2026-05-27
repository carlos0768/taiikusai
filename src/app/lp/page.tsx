"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// パネル競技の5色
const PANEL_COLORS = ["#FFD700", "#EF4444", "#1a1a1a", "#3B82F6", "#FFFFFF"];

function PanelGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = 24;
    const rows = 14;
    const cellSize = Math.min(
      canvas.parentElement!.clientWidth / cols,
      canvas.parentElement!.clientHeight / rows
    );
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    // Grid data — each cell has a target color index
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = 4; // white
      }
    }

    // Create a simple pattern — a wave of color
    function setPattern(time: number) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wave = Math.sin((c + time * 0.02) * 0.4) * 3 +
            Math.cos((r + time * 0.015) * 0.5) * 2;
          const idx = Math.abs(Math.floor(wave)) % 5;
          grid[r][c] = idx;
        }
      }
    }

    let t = 0;
    function draw() {
      if (!ctx) return;
      setPattern(t);
      t++;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = PANEL_COLORS[grid[r][c]];
          ctx.fillRect(c * cellSize, r * cellSize, cellSize - 1, cellSize - 1);
        }
      }
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl opacity-80"
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}

// Animated counter
function Counter({ target, label }: { target: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl sm:text-4xl font-bold text-accent">{target}</div>
      <div className="text-sm text-muted mt-1">{label}</div>
    </div>
  );
}

// Feature card
function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 hover:border-accent/40 transition-colors">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

// Comparison row
function CompareRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 py-4 border-b border-card-border text-sm">
      <div className="font-medium">{label}</div>
      <div className="text-muted">{before}</div>
      <div className="text-accent">{after}</div>
    </div>
  );
}

// Step card for flow
function StepCard({
  num,
  title,
  desc,
}: {
  num: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-4 items-start">
      <div className="shrink-0 w-10 h-10 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm">
        {num}
      </div>
      <div>
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-muted text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-y-auto select-text" style={{ overflow: "auto", height: "100dvh" }}>
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all"
        style={{
          background: scrollY > 50 ? "rgba(10,10,10,0.9)" : "transparent",
          backdropFilter: scrollY > 50 ? "blur(12px)" : "none",
          borderBottom: scrollY > 50 ? "1px solid #2a2a2a" : "1px solid transparent",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-black font-bold text-sm">P</span>
            </div>
            <span className="font-semibold text-lg">パネルツール</span>
          </div>
          <Link
            href="/login"
            className="px-5 py-2 bg-accent text-black font-semibold rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            ログイン
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Subtle grid bg */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-6">
                体育祭パネル競技のための専用ツール
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Excelでの<br />
                パネル作業を、<br />
                <span className="text-accent">もっと簡単に。</span>
              </h1>
              <p className="text-muted text-lg leading-relaxed mb-8 max-w-lg">
                手書きデザインのスキャン、直感的な塗り分け、アニメーション再生まで。
                パネル競技の制作フローをひとつのツールで完結。
              </p>
              <div className="flex gap-4 flex-wrap">
                <Link
                  href="/login"
                  className="px-8 py-3 bg-accent text-black font-semibold rounded-xl text-base hover:bg-accent/90 transition-colors"
                >
                  はじめる
                </Link>
                <a
                  href="#features"
                  className="px-8 py-3 border border-card-border text-foreground font-semibold rounded-xl text-base hover:border-muted transition-colors"
                >
                  機能を見る
                </a>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="w-full max-w-[480px] aspect-[24/14] relative">
                <PanelGrid />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-y border-card-border">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8">
          <Counter target="5色" label="パネルカラー対応" />
          <Counter target="1タップ" label="セル塗り替え" />
          <Counter target="0円" label="追加コストなし" />
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            こんな経験、ありませんか？
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            パネル競技の準備は、想像以上に手間がかかります。
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-card border border-card-border rounded-2xl p-6">
              <div className="text-2xl mb-3">😫</div>
              <p className="text-sm text-muted leading-relaxed">
                Excelにセルを一つずつ手打ち。色を変えるだけで何十分もかかる
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-2xl p-6">
              <div className="text-2xl mb-3">🤯</div>
              <p className="text-sm text-muted leading-relaxed">
                アニメーションの確認はシートをスクロール。完成形がイメージできない
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-2xl p-6">
              <div className="text-2xl mb-3">😤</div>
              <p className="text-sm text-muted leading-relaxed">
                デザイン担当とExcel担当で作業が分離。コミュニケーションコストが高い
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            パネルツールの機能
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            デザインからシミュレーションまで、パネル制作に必要な全てを。
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon="🎨"
              title="r/place風のワンタップ塗り"
              desc="色を選んでタップするだけ。Excelのセル入力とは比べものにならない速さでデザインできます。"
            />
            <FeatureCard
              icon="📷"
              title="手書きスキャン（AI変換）"
              desc="紙に描いたデザインをカメラで撮影。AIが自動でグリッドデータに変換します。"
            />
            <FeatureCard
              icon="▶️"
              title="アニメーション再生"
              desc="作ったデザインを繋げて再生。本番での見え方をその場で確認できます。"
            />
            <FeatureCard
              icon="🪣"
              title="バケツ塗り・範囲選択"
              desc="同色隣接セルの一括変更や、矩形選択で大きなエリアも素早く塗れます。"
            />
            <FeatureCard
              icon="🔗"
              title="シーン連結"
              desc="複数のデザインをドラッグで繋いで順番を管理。分岐にも対応しています。"
            />
            <FeatureCard
              icon="↩️"
              title="Undo / Redo"
              desc="操作の取り消し・やり直しで安心して試行錯誤。失敗を恐れずデザインできます。"
            />
          </div>
        </div>
      </section>

      {/* Before/After comparison */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Before → After
          </h2>
          <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 pb-4 border-b border-card-border text-xs text-muted font-medium">
              <div></div>
              <div>従来（Excel）</div>
              <div>パネルツール</div>
            </div>
            <CompareRow
              label="デザイン入力"
              before="セル1つずつ手打ち"
              after="タップで塗るだけ"
            />
            <CompareRow
              label="手書きデザインの取り込み"
              before="目で見て手動変換"
              after="AIが自動変換"
            />
            <CompareRow
              label="アニメーション確認"
              before="シートをスクロール"
              after="再生ボタンで即確認"
            />
            <CompareRow
              label="シーン管理"
              before="同じシートに全部書く"
              after="視覚的に連結管理"
            />
            <CompareRow
              label="必要スキル"
              before="Excel操作の知識"
              after="スマホが使えればOK"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-card/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            使い方
          </h2>
          <div className="space-y-8">
            <StepCard
              num={1}
              title="プロジェクトを作成"
              desc="グリッドサイズやパネルの色を設定。チームごとにプロジェクトを分けられます。"
            />
            <StepCard
              num={2}
              title="デザインを作成"
              desc="手書きスキャン、テンプレート、手動作成の3つの方法から選べます。"
            />
            <StepCard
              num={3}
              title="シーンを繋げる"
              desc="ダッシュボードでデザインをドラッグして連結。音楽に合わせた流れを組み立てます。"
            />
            <StepCard
              num={4}
              title="アニメーションで確認"
              desc="再生ボタンで本番の流れをシミュレーション。タイミングも調整可能。"
            />
          </div>
        </div>
      </section>

      {/* iPad optimized callout */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-card-border flex items-center justify-center text-4xl">
              📱
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            iPad に最適化
          </h2>
          <p className="text-muted max-w-xl mx-auto leading-relaxed">
            タッチ操作、ピンチズーム、ドラッグに完全対応。
            iPadをそのままパネル制作のキャンバスとして使えます。
            もちろんPCブラウザでも利用可能。
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-card border border-card-border rounded-3xl p-10 sm:p-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              パネル制作を、<br />
              <span className="text-accent">もっと楽しく。</span>
            </h2>
            <p className="text-muted mb-8 max-w-md mx-auto">
              Excelの手間から解放されて、デザインそのものに集中しよう。
            </p>
            <Link
              href="/login"
              className="inline-block px-10 py-4 bg-accent text-black font-semibold rounded-xl text-lg hover:bg-accent/90 transition-colors"
            >
              無料ではじめる
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-card-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
              <span className="text-black font-bold text-xs">P</span>
            </div>
            <span>パネルツール</span>
          </div>
          <div>体育祭パネル競技のための制作ツール</div>
        </div>
      </footer>
    </div>
  );
}
