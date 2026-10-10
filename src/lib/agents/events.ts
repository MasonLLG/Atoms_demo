import type { AgentRole } from "../types";

// 服务端 → 浏览器的 SSE 事件协议
export type GenEvent =
  | { type: "meta"; mode: "live" | "mock"; flow: "create" | "edit" }
  | { type: "agent_start"; agent: AgentRole; status: string }
  | { type: "delta"; agent: AgentRole; text: string }
  | { type: "agent_done"; agent: AgentRole; content: string; data?: unknown }
  | { type: "status"; agent: AgentRole; status: string }
  | { type: "project"; name: string; description: string }
  | { type: "version_saved"; version: { id: string; number: number; summary: string; html: string; created_at: string } }
  | { type: "error"; message: string }
  | { type: "done" };
