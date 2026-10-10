import type { AgentProfile } from "./core/types";

// 服务端 → 浏览器的 SSE 事件协议。agent 为智能体 id，内置为 leader / pm / architect / engineer，也可以是自定义 id
export type GenEvent =
  | { type: "meta"; mode: "live" | "mock"; flow: "create" | "edit" }
  | { type: "agent_start"; agent: string; status: string; profile: AgentProfile }
  | { type: "delta"; agent: string; text: string }
  | { type: "agent_done"; agent: string; content: string; data?: unknown }
  | { type: "status"; agent: string; status: string }
  | { type: "project"; name: string; description: string }
  | { type: "version_saved"; version: { id: string; number: number; summary: string; html: string; created_at: string } }
  | { type: "error"; message: string }
  | { type: "done" };
