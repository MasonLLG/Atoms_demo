"use client";

import { Loader2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** 游客模式提示条 + 绑定邮箱：把匿名账号升级为正式账号，作品全部保留 */
export function GuestBanner({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/25"
          title="游客的作品只保存在当前浏览器的登录状态里，绑定邮箱后永久保存"
        >
          <UserRound className="h-3 w-3" /> 游客 · 绑定邮箱
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span>你正在以游客身份体验。绑定邮箱后作品会永久保存，还能在其他设备登录、获得更多生成额度。</span>
          <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-medium hover:bg-amber-500/30">
            绑定邮箱
          </button>
        </div>
      )}
      {open && <BindDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function BindDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    // 同一个用户 id 上补充邮箱和密码，项目、对话、智能体都不需要迁移
    const { data, error } = await supabase.auth.updateUser({ email, password });
    setBusy(false);
    if (error) {
      setError(/already|registered|exists/i.test(error.message) ? "该邮箱已注册，请退出游客后直接登录" : error.message);
      return;
    }
    if (data.user?.is_anonymous) {
      setNotice("已发送确认邮件，点击邮件中的链接后即完成绑定。");
      return;
    }
    onClose();
    router.refresh();
  }

  const input = "mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-violet-500";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">绑定邮箱，保存你的作品</h2>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded p-1 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">绑定后当前的所有项目、版本和智能体都会保留在新账号下。</p>
        <label className="mt-4 block">
          <span className="text-xs text-muted">邮箱</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
        </label>
        <label className="mt-3 block">
          <span className="text-xs text-muted">设置密码</span>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" className={input} />
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}
        <button disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} 绑定
        </button>
      </form>
    </div>
  );
}
