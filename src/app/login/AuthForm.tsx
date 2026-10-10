"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const next = params.get("next") || "/dashboard";
  const guestError = params.get("guest_error");
  const hint = guestError
    ? `游客模式暂不可用（${guestError}），请先登录或注册，你的需求会在登录后自动开始生成`
    : next.startsWith("/agents")
    ? "登录后即可创建只属于你的智能体，并决定它们在流水线中的出场位置"
    : next.startsWith("/p/")
      ? "登录后即可把这个应用 Remix 到你的工作区"
      : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("注册成功，请前往邮箱点击确认链接后再登录。");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(translate((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/40">
      {hint && <p className="mb-4 rounded-lg bg-violet-500/10 px-3 py-2 text-xs leading-relaxed text-violet-200">{hint}</p>}
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-panel-2 p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-md py-1.5 transition ${mode === m ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
          >
            {m === "signin" ? "登录" : "注册"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-xs text-muted">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">密码</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        <button
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "signin" ? "登录" : "创建账号"}
        </button>
      </form>
    </div>
  );
}

function translate(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return "邮箱或密码错误";
  if (/already registered/i.test(msg)) return "该邮箱已注册，请直接登录";
  if (/Email not confirmed/i.test(msg)) return "邮箱尚未确认，请先查收确认邮件";
  if (/Password should be/i.test(msg)) return "密码至少 6 位";
  if (/rate limit/i.test(msg)) return "操作太频繁，请稍后再试";
  return msg;
}
