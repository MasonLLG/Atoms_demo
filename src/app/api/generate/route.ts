import { NextResponse } from "next/server";
import { z } from "zod";
import type { GenEvent } from "@/lib/agents/events";
import { getLLM } from "@/lib/agents/llm";
import { runGeneration } from "@/lib/agents/orchestrator";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4000),
});

const DAILY_LIMIT = Number(process.env.DAILY_GENERATION_LIMIT || 40);
// 游客无需注册即可体验，额度单独、更低
const GUEST_DAILY_LIMIT = Number(process.env.GUEST_DAILY_GENERATION_LIMIT || 10);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { projectId, prompt } = parsed.data;

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!project || project.user_id !== user.id) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  // 简单的每日额度，防止 API Key 被滥用
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "user")
    .gte("created_at", since);
  const limit = user.is_anonymous ? GUEST_DAILY_LIMIT : DAILY_LIMIT;
  if ((count ?? 0) >= limit) {
    const tip = user.is_anonymous ? "，绑定邮箱后可获得更多额度" : "，明天再来吧";
    return NextResponse.json({ error: `今日生成次数已达上限（${limit} 次）${tip}` }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (e: GenEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await runGeneration({
          supabase,
          llm: getLLM(),
          userId: user.id,
          project: project as Project,
          prompt,
          emit,
          signal: request.signal,
        });
      } catch (err) {
        console.error("[generate]", err);
        emit({ type: "error", message: (err as Error).message || "生成失败" });
      } finally {
        emit({ type: "done" });
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
