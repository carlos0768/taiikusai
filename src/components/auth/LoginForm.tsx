"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Convert any username (including Japanese) to ASCII-safe synthetic email
  const syntheticEmail = (name: string) => {
    const encoded = btoa(encodeURIComponent(name.trim().toLowerCase()))
      .replace(/[+/=]/g, (c) => (c === "+" ? "0" : c === "/" ? "1" : ""));
    return `u_${encoded}@taiikusai.app`;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = syntheticEmail(username);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        // Create profile
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .upsert({ id: user.id, username: username.trim() });
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError("ユーザー名またはパスワードが正しくありません");
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
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium mb-1"
          >
            ユーザー名
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors"
            placeholder="ユーザー名を入力"
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
