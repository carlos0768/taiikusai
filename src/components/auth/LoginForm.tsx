"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Use admin API to create user (bypasses email confirmation)
        const res = await fetch("/api/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: displayName.trim() || email,
          }),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || "アカウント作成に失敗しました");
          return;
        }

        // Now sign in with the created account
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError("メールアドレスまたはパスワードが正しくありません");
          return;
        }
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-center mb-2">taiikusai</h1>
      <p className="text-muted text-center text-sm mb-8">
        パネル演出ツール
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium mb-1"
            >
              表示名
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors"
              placeholder="例: たなかともき"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-1"
          >
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors"
            placeholder="example@email.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-1"
          >
            パスワード
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors"
            placeholder="パスワードを入力"
          />
        </div>

        {error && (
          <p className="text-danger text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-accent text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading
            ? "..."
            : isSignUp
              ? "アカウント作成"
              : "ログイン"}
        </button>
      </form>

      <button
        onClick={() => {
          setIsSignUp(!isSignUp);
          setError(null);
        }}
        className="w-full mt-4 text-sm text-muted hover:text-foreground transition-colors"
      >
        {isSignUp
          ? "アカウントをお持ちの方はこちら"
          : "新規アカウント作成"}
      </button>
    </div>
  );
}
