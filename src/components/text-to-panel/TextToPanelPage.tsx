"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/client/api";
import { encodeGrid } from "@/lib/grid/codec";
import {
  COLOR_MAP,
  COLOR_NAMES,
  type ColorIndex,
  type GridData,
} from "@/lib/grid/types";
import { renderPanelDslToGrid } from "@/lib/textToPanel/render";
import type { PanelDsl } from "@/lib/textToPanel/types";
import type { BranchContextResponse } from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TextToPanelResponse {
  dsl: PanelDsl;
  model: string;
  usage?: unknown;
  warnings?: string[];
}

interface GenerationResult {
  dsl: PanelDsl;
  grid: GridData;
  model: string;
  usage?: unknown;
  warnings: string[];
  createdAt: string;
}

const EXAMPLE_PROMPTS = [
  "赤い太陽と青い波、黒い文字で勝利",
  "黄色い星を中央に大きく、背景は青",
  "黒い山と赤い朝日をシンプルに",
];

const COLOR_ORDER: ColorIndex[] = [0, 1, 2, 3, 4];

function branchQuery(branchName: string) {
  return branchName === "main" ? "" : `?branch=${encodeURIComponent(branchName)}`;
}

function GridPreviewCanvas({ grid }: { grid: GridData | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;

    const cellSize = Math.max(4, Math.min(14, Math.floor(900 / grid.width)));
    canvas.width = grid.width * cellSize;
    canvas.height = grid.height * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const color = grid.cells[y * grid.width + x] as ColorIndex;
        ctx.fillStyle = COLOR_MAP[color];
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    if (cellSize >= 8) {
      ctx.strokeStyle = "rgba(128,128,128,0.25)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= grid.width; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize + 0.5, 0);
        ctx.lineTo(x * cellSize + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= grid.height; y += 1) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellSize + 0.5);
        ctx.lineTo(canvas.width, y * cellSize + 0.5);
        ctx.stroke();
      }
    }
  }, [grid]);

  if (!grid) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-card-border bg-card text-sm text-muted">
        生成結果なし
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-card-border bg-card p-3">
      <canvas ref={canvasRef} className="block max-w-full bg-white" />
    </div>
  );
}

function ColorCounts({ grid }: { grid: GridData | null }) {
  const counts = useMemo(() => {
    const next = [0, 0, 0, 0, 0];
    if (!grid) return next;

    for (const color of grid.cells) {
      if (color >= 0 && color <= 4) {
        next[color] += 1;
      }
    }
    return next;
  }, [grid]);

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {COLOR_ORDER.map((color) => (
        <div
          key={color}
          className="flex items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-2 text-sm"
        >
          <span
            className="h-4 w-4 shrink-0 rounded-sm border border-card-border"
            style={{ backgroundColor: COLOR_MAP[color] }}
          />
          <span className="text-muted">{COLOR_NAMES[color]}</span>
          <span className="ml-auto font-mono text-xs">{counts[color]}</span>
        </div>
      ))}
    </div>
  );
}

export default function TextToPanelPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const branchName = searchParams.get("branch") ?? "main";
  const [supabase] = useState(() => createClient());

  const [context, setContext] = useState<BranchContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(EXAMPLE_PROMPTS[0]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const nextContext = await fetchJson<BranchContextResponse>(
        `/api/projects/${projectId}/branches?branch=${encodeURIComponent(branchName)}`
      );
      setContext(nextContext);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "プロジェクトを読み込めませんでした"
      );
    } finally {
      setLoading(false);
    }
  }, [branchName, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleGenerate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!context || !context.canEditCurrentBranch) return;

      const prompt = input.trim();
      if (!prompt) return;

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: prompt },
      ];
      setMessages(nextMessages);
      setInput("");
      setGenerating(true);
      setActionError(null);

      try {
        const response = await fetchJson<TextToPanelResponse>(
          `/api/projects/${projectId}/text-to-panel?branch=${encodeURIComponent(branchName)}`,
          {
            method: "POST",
            body: JSON.stringify({ messages: nextMessages }),
          }
        );
        const rendered = renderPanelDslToGrid(
          response.dsl,
          context.project.grid_width,
          context.project.grid_height
        );
        const warnings = Array.from(
          new Set([...(response.warnings ?? []), ...rendered.warnings])
        );

        setLastResult({
          dsl: response.dsl,
          grid: rendered.grid,
          model: response.model,
          usage: response.usage,
          warnings,
          createdAt: new Date().toLocaleTimeString("ja-JP"),
        });
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: response.dsl.assistantMessage,
          },
        ]);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "生成に失敗しました");
      } finally {
        setGenerating(false);
      }
    },
    [branchName, context, input, messages, projectId]
  );

  const handleSave = useCallback(async () => {
    if (!context || !lastResult || !context.canEditCurrentBranch) return;

    setSaving(true);
    setActionError(null);

    try {
      const { data, error } = await supabase
        .from("zentai_gamen")
        .insert({
          project_id: projectId,
          branch_id: context.currentBranch.id,
          name: lastResult.dsl.title || "生成パネル",
          grid_data: encodeGrid(lastResult.grid),
          position_x: 0,
          position_y: 0,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw error ?? new Error("パネルを作成できませんでした");
      }

      router.push(
        `/project/${projectId}/editor/${(data as { id: string }).id}${branchQuery(
          context.currentBranch.name
        )}`
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "パネルを作成できませんでした"
      );
    } finally {
      setSaving(false);
    }
  }, [context, lastResult, projectId, router, supabase]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">{loadError ?? "プロジェクトが見つかりません"}</p>
      </div>
    );
  }

  const projectQuery = branchQuery(context.currentBranch.name);
  const canEdit = context.canEditCurrentBranch;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => router.push(`/project/${projectId}${projectQuery}`)}
            className="px-2 text-lg text-muted transition-colors hover:text-foreground"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="font-semibold">生成テスト</h1>
            <p className="truncate text-xs text-muted">
              {context.project.name} / {context.project.grid_width} x{" "}
              {context.project.grid_height} / {context.currentBranch.name}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!lastResult || saving || !canEdit}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "作成中..." : "パネルとして作成"}
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="flex min-h-0 flex-col border-b border-card-border lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-card-border bg-card px-4 py-3 text-sm text-muted">
                まだ生成していません
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "border-accent/40 bg-accent/10"
                    : "border-card-border bg-card"
                }`}
              >
                <p className="mb-1 text-xs text-muted">
                  {message.role === "user" ? "User" : "Assistant"}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleGenerate}
            className="space-y-3 border-t border-card-border p-4"
          >
            {!canEdit && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                このブランチは編集できません
              </div>
            )}
            {actionError && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {actionError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={4}
              disabled={generating || !canEdit}
              className="w-full resize-none rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent disabled:opacity-50"
              placeholder="作りたいパネルを入力"
            />
            <button
              type="submit"
              disabled={!input.trim() || generating || !canEdit}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {generating ? "生成中..." : "生成"}
            </button>
          </form>
        </section>

        <section className="min-h-0 overflow-y-auto p-4">
          <div className="mx-auto max-w-5xl space-y-4">
            <GridPreviewCanvas grid={lastResult?.grid ?? null} />
            <ColorCounts grid={lastResult?.grid ?? null} />

            {lastResult && (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-card-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">DSL</h2>
                    <span className="font-mono text-xs text-muted">
                      {lastResult.createdAt}
                    </span>
                  </div>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-background p-3 text-xs leading-relaxed text-muted">
                    {JSON.stringify(lastResult.dsl, null, 2)}
                  </pre>
                </section>

                <section className="space-y-4 rounded-lg border border-card-border bg-card p-4">
                  <div>
                    <h2 className="text-sm font-semibold">生成情報</h2>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">モデル</dt>
                        <dd className="font-mono text-xs">{lastResult.model}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">タイトル</dt>
                        <dd>{lastResult.dsl.title}</dd>
                      </div>
                    </dl>
                  </div>

                  {lastResult.usage ? (
                    <pre className="max-h-32 overflow-auto rounded-lg bg-background p-3 text-xs text-muted">
                      {JSON.stringify(lastResult.usage, null, 2)}
                    </pre>
                  ) : null}

                  {lastResult.warnings.length > 0 && (
                    <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                      <h3 className="text-sm font-semibold">警告</h3>
                      <ul className="mt-2 space-y-1 text-sm text-muted">
                        {lastResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
