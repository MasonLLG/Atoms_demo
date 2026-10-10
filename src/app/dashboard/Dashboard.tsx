"use client";

import { Globe, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { PromptBox } from "@/components/PromptBox";
import { Thumbnail } from "@/components/Thumbnail";
import { createProjectFromPrompt, PENDING_PROMPT_KEY } from "@/lib/projects";
import { createClient } from "@/lib/supabase/client";

export interface ProjectCard {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  slug: string | null;
  updated_at: string;
  html: string | null;
  versionNumber: number | null;
}

export function Dashboard({ email, projects: initial }: { email: string; projects: ProjectCard[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // 未登录时在首页输入的需求，登录后自动接着创建
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    createProjectFromPrompt(pending).then((url) => router.push(url));
  }, [router]);

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (!error) setProjects((ps) => ps.filter((p) => p.id !== id));
    setConfirmId(null);
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{email}</span>
            <button onClick={logout} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/5 hover:text-fg">
              <LogOut className="h-4 w-4" /> 退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">今天想做点什么？</h1>
          <p className="mt-2 text-sm text-muted">描述一个应用，或者从下面的模板开始</p>
          <div className="mt-6">
            <PromptBox />
          </div>
        </section>

        <section className="mt-14">
          <h2 className="mb-4 text-sm font-medium text-muted">我的项目（{projects.length}）</h2>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-muted">
              还没有项目，在上面输入你的第一个想法吧
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-xl border border-line bg-panel transition hover:border-violet-500/50">
                  <Link href={`/project/${p.id}`} className="block">
                    <div className="aspect-[16/10] border-b border-line">
                      <Thumbnail html={p.html} scope={p.id} />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium">{p.name}</h3>
                        {p.is_public && <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="已发布" />}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted">{p.description || "等待生成"}</p>
                      <p className="mt-2 text-[11px] text-muted/70">
                        {p.versionNumber ? `v${p.versionNumber} · ` : ""}
                        {new Date(p.updated_at).toLocaleString("zh-CN", { hour12: false })}
                      </p>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                    {confirmId === p.id ? (
                      <div className="flex gap-1 rounded-lg bg-black/80 p-1 text-xs">
                        <button onClick={() => remove(p.id)} className="rounded bg-red-500 px-2 py-1 text-white">
                          确认删除
                        </button>
                        <button onClick={() => setConfirmId(null)} className="rounded px-2 py-1 text-white/80">
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(p.id)}
                        aria-label="删除项目"
                        className="rounded-lg bg-black/70 p-1.5 text-white/80 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
