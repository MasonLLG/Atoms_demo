import { NextResponse } from "next/server";
import { z } from "zod";
import type { GenEvent } from "@/lib/agents/events";
import { getLLM } from "@/lib/agents/llm";
import { runGeneration } from "@/lib/agents/orchestrator";
import { AppError, describeCause, logEvent, toAppError, toPublicError } from "@/lib/errors";
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

function errorResponse(err: AppError, requestId: string) {
  return NextResponse.json(
    { error: { code: err.code, message: err.message, retryable: err.retryable }, requestId },
    { status: err.status, headers: { "X-Request-Id": requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(new AppError("UNAUTHORIZED"), requestId);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(new AppError("BAD_REQUEST", "需求内容不能为空，且不超过 4000 字"), requestId);
  const { projectId, prompt } = parsed.data;

  const { data: project, error: projectError } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (projectError) {
    logEvent("error", "generate.project_query_failed", { requestId, projectId, cause: projectError.message });
    return errorResponse(new AppError("DB_ERROR"), requestId);
  }
  if (!project || project.user_id !== user.id) return errorResponse(new AppError("NOT_FOUND"), requestId);

  // 每日额度，防止 API Key 被滥用
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
    return errorResponse(new AppError("RATE_LIMITED", `今日生成次数已达上限（${limit} 次）${tip}`), requestId);
  }

  const llm = getLLM();
  const logBase = { requestId, userId: user.id, projectId, guest: !!user.is_anonymous, mode: llm.mode };
  logEvent("info", "generate.start", { ...logBase, promptLength: prompt.length });

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
      // SSE 注释行作为心跳，避免代理在模型思考期间断开空闲连接
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);
      try {
        await runGeneration({ supabase, llm, userId: user.id, project: project as Project, prompt, emit, signal: request.signal });
        logEvent("info", "generate.done", { ...logBase, durationMs: Date.now() - startedAt });
      } catch (err) {
        const appErr = toAppError(err);
        logEvent(appErr.code === "CANCELLED" ? "info" : "error", "generate.failed", {
          ...logBase,
          code: appErr.code,
          durationMs: Date.now() - startedAt,
          ...describeCause(appErr),
        });
        emit({ type: "error", ...toPublicError(appErr), requestId });
      } finally {
        clearInterval(heartbeat);
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
      "X-Request-Id": requestId,
    },
  });
}
