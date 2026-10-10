import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PromptBox } from "@/components/PromptBox";
import { createClient } from "@/lib/supabase/server";
import { AGENT_PRESETS } from "@/lib/agents/custom";
import { BUILTIN_PROFILES as AGENTS } from "@/lib/types";

const AGENT_DUTIES: Record<keyof typeof AGENTS, string> = {
  leader: "理解你的需求，拆解任务并分派给团队成员。",
  pm: "输出结构化需求文档：功能、优先级、页面与数据模型。",
  architect: "给出视觉风格、模块划分与数据结构设计。",
  engineer: "流式编写代码，并根据你的反馈增量修改。",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[600px]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
              我的工作台
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-fg">
                登录
              </Link>
              <Link href="/login?mode=signup" className="rounded-lg bg-violet-500 px-3 py-1.5 text-white hover:bg-violet-400">
                免费注册
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="relative mx-auto flex max-w-3xl flex-col items-center px-5 pt-16 pb-24 text-center sm:pt-24">
        <span className="mb-5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
          多智能体协作 · 实时预览 · 一键发布
        </span>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          把想法变成<span className="text-gradient">可运行的应用</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
          用一句话描述需求，AI 团队会撰写需求文档、设计技术方案并写出代码，几十秒后你就能直接使用它。
        </p>
        <div className="mt-10 w-full">
          <PromptBox autoFocus />
          {!user && <p className="mt-3 text-xs text-muted">无需注册，直接开始体验；想保留作品时再绑定邮箱即可</p>}
        </div>

        <section className="mt-20 w-full text-left">
          <div className="text-center">
            <h2 className="text-lg font-semibold sm:text-xl">你的 AI 研发团队</h2>
            <p className="mt-1 text-sm text-muted">四位内置成员接力完成从需求到代码的全过程，你还可以招募自己的专家加入流水线</p>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-4">
            {(Object.keys(AGENTS) as (keyof typeof AGENTS)[]).map((k, i) => {
              const a = AGENTS[k];
              return (
                <li key={k} className="relative rounded-xl border border-line bg-panel/70 p-4">
                  <span className="absolute right-3 top-3 font-mono text-[10px] text-muted/60">0{i + 1}</span>
                  {i > 0 && (
                    <span aria-hidden className="absolute -left-[11px] top-1/2 hidden -translate-y-1/2 text-muted/40 sm:block">
                      →
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: a.color }}>
                      {a.avatar}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted">{a.title}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted">{AGENT_DUTIES[k]}</p>
                </li>
              );
            })}
          </ol>

          <div className="mt-3 flex flex-col items-start gap-4 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 p-4 sm:flex-row sm:items-center">
            <div className="flex -space-x-2">
              {AGENT_PRESETS.map((p) => (
                <span
                  key={p.slug}
                  title={`${p.name} · ${p.title}`}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-bg text-xs font-semibold text-white"
                  style={{ background: p.color }}
                >
                  {p.avatar}
                </span>
              ))}
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-dashed border-violet-400/60 bg-bg text-violet-300">
                <Plus className="h-4 w-4" />
              </span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">自定义你的智能体工作流</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                招募无障碍顾问、文案专家、UI 设计师、安全审查等成员，或者从零写一个。自由决定它在哪一步出场，它的建议会交给 Alex 落地。
              </p>
            </div>
            <Link
              href={user ? "/agents" : "/login?mode=signup&next=/agents"}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400"
            >
              {user ? "管理我的智能体" : "登录后自定义"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
