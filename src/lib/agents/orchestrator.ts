import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { AgentRole, Project } from "../types";
import type { GenEvent } from "./events";
import { applyPatches, extractHtml, extractSummary, FILE_START, parsePatches } from "./extract";
import type { LLM } from "./llm";
import {
  ARCHITECT_SYSTEM,
  ENGINEER_CREATE_SYSTEM,
  ENGINEER_EDIT_SYSTEM,
  ENGINEER_REWRITE_SYSTEM,
  engineerCreateUser,
  engineerEditUser,
  PM_SYSTEM,
} from "./prompts";
import { DesignSchema, PrdSchema } from "./schemas";
import { saveVersion } from "../versions";

interface RunOptions {
  supabase: SupabaseClient;
  llm: LLM;
  userId: string;
  project: Project;
  prompt: string;
  emit: (e: GenEvent) => void;
  signal?: AbortSignal;
}

/**
 * 多智能体编排：
 * - 首次生成：Mike 分派 → Emma 写 PRD（JSON）→ Bob 出技术设计（JSON）→ Alex 流式写代码
 * - 迭代修改：Alex 基于当前版本输出 SEARCH/REPLACE 补丁，打不上时回退为整文件重写
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

  let html: string;
  let summary: string;

  if (!currentHtml) {
    const leaderText = "收到需求！我来安排：Emma 先梳理需求文档，Bob 设计技术方案，最后由 Alex 完成开发。";
    emit({ type: "agent_start", agent: "leader", status: "分派任务" });
    emit({ type: "agent_done", agent: "leader", content: leaderText });
    await saveMessage("leader", leaderText);

    emit({ type: "agent_start", agent: "pm", status: "正在撰写需求文档" });
    const prd = await callJson(llm, PM_SYSTEM, prompt, PrdSchema, signal);
    const pmText = `需求文档已完成：「${prd.appName}」，${prd.summary}`;
    emit({ type: "agent_done", agent: "pm", content: pmText, data: prd });
    await saveMessage("pm", pmText, prd);

    await supabase
      .from("projects")
      .update({ name: prd.appName, description: prd.summary, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    emit({ type: "project", name: prd.appName, description: prd.summary });

    emit({ type: "agent_start", agent: "architect", status: "正在设计技术方案" });
    const design = await callJson(
      llm,
      ARCHITECT_SYSTEM,
      `用户原始需求：${prompt}\n\n需求文档：\n${JSON.stringify(prd, null, 2)}`,
      DesignSchema,
      signal,
    );
    const archText = `技术方案已完成：${design.style.theme}风格，拆分为 ${design.components.length} 个模块。`;
    emit({ type: "agent_done", agent: "architect", content: archText, data: design });
    await saveMessage("architect", archText, design);

    emit({ type: "agent_start", agent: "engineer", status: "正在编写代码" });
    const out = await streamAgent(llm, "engineer", ENGINEER_CREATE_SYSTEM, engineerCreateUser(prompt, prd, design), emit, signal);
    const extracted = extractHtml(out);
    if (!extracted) throw new Error("工程师没有输出有效的 HTML，请重试");
    html = extracted;
    summary = extractSummary(out) || "完成第一版开发";
  } else {
    const history = await recentHistory(supabase, project.id);
    emit({ type: "agent_start", agent: "engineer", status: "正在修改代码" });
    const out = await streamAgent(llm, "engineer", ENGINEER_EDIT_SYSTEM, engineerEditUser(prompt, currentHtml, history), emit, signal);
    summary = extractSummary(out) || "根据反馈完成修改";

    let next: string | null = null;
    if (out.includes(FILE_START)) {
      next = extractHtml(out);
    } else {
      const patches = parsePatches(out);
      if (patches.length > 0) {
        const res = applyPatches(currentHtml, patches);
        if (res.ok) next = res.html;
      }
    }
    if (!next) {
      emit({ type: "status", agent: "engineer", status: "补丁未能精确应用，改为整文件重写" });
      const full = await streamAgent(
        llm,
        "engineer",
        ENGINEER_REWRITE_SYSTEM,
        engineerEditUser(prompt, currentHtml, history),
        emit,
        signal,
      );
      next = extractHtml(full);
      summary = extractSummary(full) || summary;
      if (!next) throw new Error("工程师没有输出有效的 HTML，请重试");
    }
    html = next;
  }

  const version = await saveVersion(supabase, project.id, userId, html, summary, "agent");
  await saveMessage("engineer", summary, null, version.id);
  emit({ type: "agent_done", agent: "engineer", content: summary });
  emit({ type: "version_saved", version: { ...version, summary, html } });
}

async function callJson<T>(llm: LLM, system: string, user: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
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

async function streamAgent(
  llm: LLM,
  agent: AgentRole,
  system: string,
  user: string,
  emit: (e: GenEvent) => void,
  signal?: AbortSignal,
) {
  let buf = "";
  let last = Date.now();
  const flush = () => {
    if (buf) emit({ type: "delta", agent, text: buf });
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
