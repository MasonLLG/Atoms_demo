import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PromptBox } from "@/components/PromptBox";
import { createClient } from "@/lib/supabase/server";
import { BUILTIN_PROFILES as AGENTS } from "@/lib/types";

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
        </div>

        <section className="mt-20 grid w-full gap-3 text-left sm:grid-cols-4">
          {(Object.keys(AGENTS) as (keyof typeof AGENTS)[]).map((k) => {
            const a = AGENTS[k];
            return (
              <div key={k} className="rounded-xl border border-line bg-panel/70 p-4">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ background: a.color }}
                  >
                    {a.avatar}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-muted">{a.title}</div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {
                    {
                      leader: "理解你的需求，拆解任务并分派给团队成员。",
                      pm: "输出结构化需求文档：功能、优先级、页面与数据模型。",
                      architect: "给出视觉风格、模块划分与数据结构设计。",
                      engineer: "流式编写代码，并根据你的反馈增量修改。",
                    }[k]
                  }
                </p>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
