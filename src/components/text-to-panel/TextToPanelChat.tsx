"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import { fetchJson } from "@/lib/client/api";
import { encodeGrid } from "@/lib/grid/codec";
import { COLOR_MAP, type ColorIndex, type GridData } from "@/lib/grid/types";
import { renderPanelDslToGrid } from "@/lib/textToPanel/render";
import type { PanelDsl } from "@/lib/textToPanel/types";
import type { BranchScopedProject, ProjectBranch, ZentaiGamen } from "@/types";

interface PanelMessageResult {
  dsl: PanelDsl;
  model: string;
  usage?: unknown;
  warnings: string[];
  createdAt: string;
}

interface TextToPanelMessage {
  role: "user" | "assistant";
  content: string;
  panelResult?: PanelMessageResult;
}

interface TextToPanelResponse {
  dsl: PanelDsl;
  model: string;
  usage?: unknown;
  warnings?: string[];
  messages: TextToPanelMessage[];
  savedAt: string;
}

interface TextToPanelHistoryResponse {
  messages: TextToPanelMessage[];
  lastResult: PanelMessageResult | null;
}

interface CreatePanelInput {
  name: string;
  gridData: string;
}

interface TextToPanelChatProps {
  project: BranchScopedProject;
  currentBranch: ProjectBranch;
  canEditCurrentBranch: boolean;
  onClose: () => void;
  onCreatePanel: (input: CreatePanelInput) => Promise<ZentaiGamen>;
}

const EXAMPLE_PROMPTS = [
  "赤い太陽と青い波、黒い文字で勝利",
  "黄色い星を中央に大きく、背景は青",
  "黒い山と赤い朝日をシンプルに",
];

function GridPreviewCanvas({ grid }: { grid: GridData | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;

    const cellSize = Math.max(5, Math.min(11, Math.floor(520 / grid.width)));
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
      ctx.strokeStyle = "rgba(128,128,128,0.22)";
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
      <div className="flex h-32 items-center justify-center rounded-lg border border-card-border bg-background text-xs text-muted">
        プレビューを準備中...
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-card-border bg-white p-2">
      <canvas ref={canvasRef} className="block max-w-full" />
    </div>
  );
}

function PanelPreviewCard({
  panelResult,
  project,
  canEdit,
  saving,
  createdPanelId,
  onCreate,
}: {
  panelResult: PanelMessageResult;
  project: BranchScopedProject;
  canEdit: boolean;
  saving: boolean;
  createdPanelId?: string;
  onCreate: () => void;
}) {
  const [grid, setGrid] = useState<GridData | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rendered = renderPanelDslToGrid(
        panelResult.dsl,
        project.grid_width,
        project.grid_height
      );
      setGrid(rendered.grid);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [panelResult.dsl, project.grid_height, project.grid_width]);

  return (
    <div className="mt-3 rounded-xl border border-card-border bg-background/85 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {panelResult.dsl.title || "生成パネル"}
          </p>
          <p className="text-xs text-muted">
            {project.grid_width} x {project.grid_height}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canEdit || saving || Boolean(createdPanelId)}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {createdPanelId ? "作成済み" : saving ? "作成中..." : "パネルとして作成"}
        </button>
      </div>
      <GridPreviewCanvas grid={grid} />
    </div>
  );
}

export default function TextToPanelChat({
  project,
  currentBranch,
  canEditCurrentBranch,
  onClose,
  onCreatePanel,
}: TextToPanelChatProps) {
  const [messages, setMessages] = useState<TextToPanelMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [createdPanelIds, setCreatedPanelIds] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiUrl = `/api/projects/${project.id}/text-to-panel?branch=${encodeURIComponent(
    currentBranch.id
  )}`;

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);

    try {
      const history = await fetchJson<TextToPanelHistoryResponse>(apiUrl);
      setMessages(history.messages);
      setCreatedPanelIds({});
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "会話履歴を読み込めませんでした"
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    if (!canEditCurrentBranch || generating) return;

    const prompt = input.trim();
    if (!prompt) return;

    const previousMessages = messages;
    const nextMessages: TextToPanelMessage[] = [
      ...messages,
      { role: "user", content: prompt },
    ];

    setMessages(nextMessages);
    setInput("");
    setGenerating(true);
    setError(null);

    try {
      const response = await fetchJson<TextToPanelResponse>(apiUrl, {
        method: "POST",
        body: JSON.stringify({ messages: nextMessages }),
      });
      setMessages(response.messages);
    } catch (generateError) {
      setMessages(previousMessages);
      setInput(prompt);
      setError(
        generateError instanceof Error
          ? generateError.message
          : "生成に失敗しました"
      );
    } finally {
      setGenerating(false);
    }
  }, [apiUrl, canEditCurrentBranch, generating, input, messages]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    setError(null);

    try {
      await fetchJson<{ ok: true }>(apiUrl, { method: "DELETE" });
      setMessages([]);
      setCreatedPanelIds({});
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "履歴をクリアできませんでした"
      );
    } finally {
      setClearing(false);
    }
  }, [apiUrl]);

  const handleCreatePanel = useCallback(
    async (panelResult: PanelMessageResult, key: string) => {
      setSavingKey(key);
      setError(null);

      try {
        const rendered = renderPanelDslToGrid(
          panelResult.dsl,
          project.grid_width,
          project.grid_height
        );
        const panel = await onCreatePanel({
          name: panelResult.dsl.title || "生成パネル",
          gridData: encodeGrid(rendered.grid),
        });
        setCreatedPanelIds((current) => ({
          ...current,
          [key]: panel.id,
        }));
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "パネルを作成できませんでした"
        );
      } finally {
        setSavingKey(null);
      }
    },
    [onCreatePanel, project.grid_height, project.grid_width]
  );

  const hasHistory = messages.length > 0;

  return (
    <div className="flex max-h-[82vh] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-card-border bg-card/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between gap-3 border-b border-card-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">AI生成</h2>
          <p className="truncate text-xs text-muted">
            {project.name} / {currentBranch.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || generating || !hasHistory}
            className="rounded-lg border border-card-border px-3 py-2 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-40"
          >
            {clearing ? "クリア中..." : "履歴クリア"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-card-border text-muted transition-colors hover:border-accent/50 hover:text-foreground"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loadingHistory && (
          <div className="rounded-xl border border-card-border bg-background/70 px-4 py-3 text-sm text-muted">
            履歴を読み込み中...
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-card-border bg-background/70 px-4 py-8 text-center text-sm text-muted">
            作りたいパネルを入力してください
          </div>
        )}

        {messages.map((message, index) => {
          const messageKey = `${index}-${message.role}`;
          return (
            <div
              key={messageKey}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-accent text-black"
                    : "border border-card-border bg-background/80 text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
                {message.panelResult && (
                  <PanelPreviewCard
                    panelResult={message.panelResult}
                    project={project}
                    canEdit={canEditCurrentBranch}
                    saving={savingKey === messageKey}
                    createdPanelId={createdPanelIds[messageKey]}
                    onCreate={() => {
                      if (!message.panelResult) return;
                      void handleCreatePanel(message.panelResult, messageKey);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-card-border p-4">
        {!canEditCurrentBranch && (
          <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            このブランチは編集できません
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        <AIChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={!canEditCurrentBranch || loadingHistory}
          loading={generating}
          placeholders={EXAMPLE_PROMPTS}
        />
      </div>
    </div>
  );
}
