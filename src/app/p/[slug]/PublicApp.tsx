"use client";

import { Loader2, Shuffle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Preview } from "@/components/Preview";
import { createClient } from "@/lib/supabase/client";
import { saveVersion } from "@/lib/versions";

interface Props {
  slug: string;
  app: { id: string; name: string; description: string | null; html: string };
}

export function PublicApp({ slug, app }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Remix：把公开应用复制为自己的项目，继续让 AI 修改
  async function remix() {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?next=/p/${slug}`);
      return;
    }
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: `${app.name}（Remix）`, description: app.description })
      .select("id")
      .single();
    if (error || !project) {
      setBusy(false);
      return;
    }
    await saveVersion(supabase, project.id, user.id, app.html, `Remix 自「${app.name}」`, "remix");
    await supabase.from("messages").insert({
      project_id: project.id,
      user_id: user.id,
      role: "system",
      content: `已从公开应用「${app.name}」Remix，继续描述你想做的修改吧。`,
    });
    router.push(`/project/${project.id}`);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-3 text-sm">
        <Link href="/" className="flex items-center gap-1.5 text-xs text-muted hover:text-fg">
          <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px] text-white">⚛</span>
          Atoms Demo
        </Link>
        <span className="truncate font-medium">{app.name}</span>
        <button
          onClick={remix}
          disabled={busy}
          className="ml-auto flex items-center gap-1 rounded-md bg-violet-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-400 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
          Remix
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <Preview html={app.html} scope={`public:${app.id}`} />
      </div>
    </div>
  );
}
