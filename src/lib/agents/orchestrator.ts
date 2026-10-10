import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../types";
import type { Agent, AgentContext } from "./core/types";
import { runPipeline } from "./core/runner";
import type { GenEvent } from "./events";
import type { LLM } from "./llm";
import { buildTeam, isBuiltinAgent, loadCustomAgents, loadUserAgents } from "./team";

interface RunOptions {
  supabase: SupabaseClient;
  llm: LLM;
  userId: string;
  project: Project;
  prompt: string;
  emit: (e: GenEvent) => void;
  signal?: AbortSignal;
  /** 不传则使用：内置团队 + 环境变量中的全局自定义智能体 + 当前用户启用的自定义智能体 */
  team?: Agent[];
}

/**
 * 一次生成：准备共享上下文，组装团队，然后交给流水线执行。
 * - 首次生成：Mike → Emma（PRD）→ Bob（技术方案）→ [自定义智能体] → Alex（写代码）
 * - 迭代修改：[声明参与迭代的自定义智能体] → Alex（补丁）
 * 每个成员是否出场由它自己的 when() 决定。
 */
export async function runGeneration(opts: RunOptions) {
  const { supabase, llm, userId, project, prompt, emit, signal } = opts;

  const saveMessage = async (role: string, content: string, data?: unknown, versionId?: string) => {
    const { error } = await supabase.from("messages").insert({
      project_id: project.id,
      user_id: userId,
      role,
      content,
      data: data ?? null,
      version_id: versionId ?? null,
    });
    if (error) throw new Error(`保存消息失败：${error.message}`);
  };

  await saveMessage("user", prompt);

  let currentHtml: string | null = null;
  if (project.current_version_id) {
    const { data } = await supabase.from("versions").select("html").eq("id", project.current_version_id).single();
    currentHtml = data?.html ?? null;
  }
  const flow = currentHtml ? "edit" : "create";
  emit({ type: "meta", mode: llm.mode, flow });

  const ctx: AgentContext = {
    prompt,
    project,
    userId,
    flow,
    currentHtml,
    team: [],
    history: flow === "edit" ? await recentHistory(supabase, project.id) : "",
    artifacts: {},
    notes: [],
  };

  const team = opts.team ?? buildTeam([...loadCustomAgents(), ...(await loadUserAgents(supabase, userId))], { skipInvalid: true });

  await runPipeline(team, ctx, {
    llm,
    supabase,
    emit,
    signal,
    saveMessage,
    isBuiltin: isBuiltinAgent,
  });
  if (!ctx.output) throw new Error("本次生成没有产出新版本");
}

async function recentHistory(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .eq("project_id", projectId)
    .in("role", ["user", "engineer"])
    .order("created_at", { ascending: false })
    .limit(7);
  // 最新一条是刚保存的本次请求，去掉
  return (data ?? [])
    .slice(1)
    .reverse()
    .map((m) => `${m.role === "user" ? "用户" : "Alex"}：${m.content}`)
    .join("\n");
}
