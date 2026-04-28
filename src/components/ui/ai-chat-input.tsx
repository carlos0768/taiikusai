"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles } from "lucide-react";

const DEFAULT_PLACEHOLDERS = [
  "赤い太陽と青い波、黒い文字で勝利",
  "黄色い星を中央に大きく、背景は青",
  "黒い山と赤い朝日をシンプルに",
];

interface AIChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  placeholders?: string[];
}

export function AIChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  placeholders = DEFAULT_PLACEHOLDERS,
}: AIChatInputProps) {
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [showPlaceholder, setShowPlaceholder] = React.useState(true);
  const [isActive, setIsActive] = React.useState(false);
  const wrapperRef = React.useRef<HTMLFormElement>(null);
  const trimmedValue = value.trim();
  const canSubmit = Boolean(trimmedValue) && !disabled && !loading;

  React.useEffect(() => {
    if (isActive || value || placeholders.length <= 1) return;

    const interval = window.setInterval(() => {
      setShowPlaceholder(false);
      window.setTimeout(() => {
        setPlaceholderIndex((current) => (current + 1) % placeholders.length);
        setShowPlaceholder(true);
      }, 300);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isActive, placeholders.length, value]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node) &&
        !value
      ) {
        setIsActive(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void onSubmit();
  }

  return (
    <motion.form
      ref={wrapperRef}
      onSubmit={handleSubmit}
      className="w-full overflow-hidden rounded-[28px] border border-card-border bg-white text-black shadow-2xl"
      animate={{
        height: isActive || value ? 118 : 64,
        boxShadow:
          isActive || value
            ? "0 18px 48px rgba(0,0,0,0.32)"
            : "0 8px 24px rgba(0,0,0,0.22)",
      }}
      initial={false}
      transition={{ type: "spring", stiffness: 140, damping: 20 }}
      onClick={() => setIsActive(true)}
    >
      <div className="flex h-full flex-col">
        <div className="flex min-h-16 items-center gap-2 px-3 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white">
            <Sparkles size={18} />
          </div>

          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={value}
              disabled={disabled || loading}
              onFocus={() => setIsActive(true)}
              onChange={(event) => onChange(event.target.value)}
              className="relative z-10 w-full rounded-md border-0 bg-transparent px-0 py-2 text-base font-normal outline-none placeholder:text-transparent disabled:cursor-not-allowed"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center py-2">
              <AnimatePresence mode="wait">
                {showPlaceholder && !isActive && !value && (
                  <motion.span
                    key={placeholderIndex}
                    className="absolute left-0 max-w-full select-none overflow-hidden text-ellipsis whitespace-nowrap text-gray-400"
                    initial={{ opacity: 0, filter: "blur(10px)", y: 8 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    exit={{ opacity: 0, filter: "blur(10px)", y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    {placeholders[placeholderIndex] ?? DEFAULT_PLACEHOLDERS[0]}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            title="送信"
          >
            <Send size={18} />
          </button>
        </div>

        <motion.div
          className="flex items-center px-5 pb-4 text-xs text-gray-500"
          initial={false}
          animate={{
            opacity: isActive || value ? 1 : 0,
            y: isActive || value ? 0 : 12,
          }}
          transition={{ duration: 0.2 }}
        >
          {loading ? "生成中..." : "作りたいパネルを短く入力"}
        </motion.div>
      </div>
    </motion.form>
  );
}
