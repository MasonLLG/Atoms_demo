import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { GenEvent } from "../events";
import type { LLM } from "../llm";
import type { Agent, AgentContext, AgentIO } from "./types";

interface RunnerDeps {
  llm: LLM;
  supabase: SupabaseClient;
  emit: (e: GenEvent) => void;
  signal?: AbortSignal;
  saveMessage: (role: string, content: string, data?: unknown, versionId?: string) => Promise<void>;
  /** 内置角色的形象由前端自带，其余（自定义）智能体的形象随消息持久化 */
  isBuiltin: (id: string) => boolean;
}

/** 依次执行流水线上的智能体：负责事件推送、状态更新、消息持久化，智能体只关心自己的工作 */
export async function runPipeline(agents: Agent[], ctx: AgentContext, deps: RunnerDeps) {
  const active = agents.filter((a) => !a.when || a.when(ctx));
  ctx.team = active.map((a) => ({ id: a.id, profile: a.profile }));
  for (const agent of active) {
    if (deps.signal?.aborted) throw new Error("已取消");

    deps.emit({ type: "agent_start", agent: agent.id, status: agent.startStatus, profile: agent.profile });
    const result = await agent.run(ctx, createIO(agent, deps));

    const builtin = deps.isBuiltin(agent.id);
    const data = builtin ? result.data : { ...(isObject(result.data) ? result.data : {}), _agent: agent.profile };
    await deps.saveMessage(agent.id, result.content, data, result.versionId);
    deps.emit({ type: "agent_done", agent: agent.id, content: result.content, data });
  }
}

function createIO(agent: Agent, deps: RunnerDeps): AgentIO {
  return {
    llm: deps.llm,
    supabase: deps.supabase,
    signal: deps.signal,
    emit: deps.emit,
    status: (text) => deps.emit({ type: "status", agent: agent.id, status: text }),
    json: (system, user, schema) => callJson(deps.llm, system, user, schema, deps.signal),
    stream: (system, user) => streamWithDeltas(deps.llm, agent.id, system, user, deps.emit, deps.signal),
  };
}

export async function callJson<T>(llm: LLM, system: string, user: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = attempt === 0 ? user : `${user}\n\n你上一次的输出不合法（${lastError}），请严格按 JSON Schema 重新输出 json。`;
    const raw = await llm.json(system, input, signal);
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = `JSON 解析失败：${(e as Error).message}`;
    }
  }
  throw new Error(`模型输出格式错误：${lastError}`);
}

async function streamWithDeltas(
  llm: LLM,
  agentId: string,
  system: string,
  user: string,
  emit: (e: GenEvent) => void,
  signal?: AbortSignal,
) {
  let buf = "";
  let last = Date.now();
  const flush = () => {
    if (buf) emit({ type: "delta", agent: agentId, text: buf });
    buf = "";
    last = Date.now();
  };
  const full = await llm.stream(
    system,
    user,
    (t) => {
      buf += t;
      if (Date.now() - last > 80) flush();
    },
    signal,
  );
  flush();
  return full;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
