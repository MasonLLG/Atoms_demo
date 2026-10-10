"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectFromPrompt, TEMPLATES } from "@/lib/projects";

export function PromptBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(text = prompt) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      router.push(await createProjectFromPrompt(value));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-line bg-panel/80 p-3 shadow-2xl shadow-violet-950/30 backdrop-blur focus-within:border-violet-500/60">
        <textarea
          autoFocus={autoFocus}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="描述你想要的应用，例如：做一个记录每天喝水量的小工具，带提醒和周统计"
          className="w-full resize-none bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-muted/70"
        />
        <div className="flex items-center justify-between">
          <span className="px-2 text-xs text-muted">Enter 发送，Shift + Enter 换行</span>
          <button
            onClick={() => submit()}
            disabled={!prompt.trim() || busy}
            aria-label="开始生成"
            className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => submit(t.prompt)}
            disabled={busy}
            title={t.prompt}
            className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:border-violet-500/60 hover:text-fg"
          >
            {t.icon} {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}
