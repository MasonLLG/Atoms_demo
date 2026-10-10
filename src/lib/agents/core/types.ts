import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Project } from "../../types";
import type { GenEvent } from "../events";
import type { LLM } from "../llm";

/** 智能体在界面上的形象 */
export interface AgentProfile {
  name: string;
  title: string;
  color: string;
  avatar: string;
  description?: string;
}

/** 某个智能体留给后续成员的笔记（自定义智能体的产出通过它进入工程师的上下文） */
export interface AgentNote {
  agentId: string;
  agentName: string;
  content: string;
}

/**
 * 一次生成过程中所有智能体共享的上下文（黑板模式）：
 * 每个智能体读取前面成员写入的产物，再写入自己的产物。
 */
export interface AgentContext {
  readonly prompt: string;
  readonly project: Project;
  readonly userId: string;
  readonly flow: "create" | "edit";
  /** 当前版本代码；迭代修改时存在 */
  readonly currentHtml: string | null;
  /** 本次出场的团队成员（按顺序），供负责人分派任务等场景使用 */
  team: { id: string; profile: AgentProfile }[];
  /** 最近几轮对话的文字摘要 */
  readonly history: string;
  /** 结构化产物，按智能体 id 存放，如 artifacts.pm 为 PRD */
  artifacts: Record<string, unknown>;
  /** 供后续成员参考的自由文本笔记 */
  notes: AgentNote[];
  /** 流水线是否被某个成员主动结束 */
  halted?: boolean;
  /** 本次生成产出的新版本 */
  output?: { html: string; summary: string; versionId: string; versionNumber: number };
}

/** 运行时提供给智能体的能力，智能体不直接接触 SSE 或数据库细节 */
export interface AgentIO {
  readonly llm: LLM;
  readonly supabase: SupabaseClient;
  readonly signal?: AbortSignal;
  /** 更新本智能体的状态文字 */
  status(text: string): void;
  /** 调用模型并按 schema 校验 JSON，失败自动重试一次 */
  json<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T>;
  /** 流式调用模型，增量实时推送到前端，返回完整文本 */
  stream(system: string, user: string): Promise<string>;
  /** 向前端推送任意事件（如项目信息更新、版本保存） */
  emit(event: GenEvent): void;
}

export interface AgentResult {
  /** 展示在对话中的文字 */
  content: string;
  /** 结构化产物，持久化到 messages.data，前端可渲染成卡片 */
  data?: unknown;
  /** 若本次产出了新版本，关联到消息上 */
  versionId?: string;
  /** 为 true 时流水线在本智能体之后结束（如负责人判断这只是闲聊或提问） */
  halt?: boolean;
}

/**
 * 智能体的最小接口。内置角色与自定义智能体都实现它，
 * 编排器只依赖这个接口，新增角色不需要修改主流程。
 */
export interface Agent {
  readonly id: string;
  readonly profile: AgentProfile;
  /** 开始时展示的状态文字 */
  readonly startStatus: string;
  /** 返回 false 时跳过本智能体 */
  when?(ctx: AgentContext): boolean;
  run(ctx: AgentContext, io: AgentIO): Promise<AgentResult>;
}
