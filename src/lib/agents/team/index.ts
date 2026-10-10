import type { SupabaseClient } from "@supabase/supabase-js";
import { BUILTIN_PROFILES } from "../../types";
import { type CustomAgentConfig, defineCustomAgent } from "../core/factories";
import { type CustomAgentRow, orderLineup, rowToConfig } from "../custom";
import type { Agent } from "../core/types";
import { architect } from "./architect";
import { engineer } from "./engineer";
import { leader } from "./leader";
import { pm } from "./pm";

export const isBuiltinAgent = (id: string) => id in BUILTIN_PROFILES;

/** 组装团队：内置成员按 负责人 → 产品 → 架构 → 工程 排列，自定义智能体按 after 插入 */
export function buildTeam(custom: CustomAgentConfig[] = [], opts: { skipInvalid?: boolean } = {}): Agent[] {
  const builtins: Record<string, Agent> = { leader, pm, architect, engineer };
  const agents: (Agent & { after: string })[] = [];
  for (const cfg of custom) {
    try {
      const agent = defineCustomAgent(cfg);
      if (isBuiltinAgent(agent.id) || agents.some((a) => a.id === agent.id)) {
        throw new Error(`智能体 id 重复：${agent.id}`);
      }
      agents.push(agent);
    } catch (e) {
      if (!opts.skipInvalid) throw e;
      console.warn("[agents] 跳过无效的自定义智能体：", cfg?.id, (e as Error).message);
    }
  }
  return orderLineup(agents).map((x) => (typeof x === "string" ? builtins[x] : x));
}

/** 用户在「我的智能体」中启用的智能体（受 RLS 保护，只会读到当前登录用户自己的） */
export async function loadUserAgents(supabase: SupabaseClient, userId: string): Promise<CustomAgentConfig[]> {
  const { data, error } = await supabase
    .from("custom_agents")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (error) {
    // 数据库尚未执行 migration 003 时不影响内置团队
    console.warn("[agents] 读取自定义智能体失败：", error.message);
    return [];
  }
  return (data as CustomAgentRow[]).map(rowToConfig);
}

/** 从环境变量 CUSTOM_AGENTS（JSON 数组）读取自定义智能体，配置错误时忽略并打日志 */
export function loadCustomAgents(): CustomAgentConfig[] {
  const raw = process.env.CUSTOM_AGENTS;
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error("[agents] CUSTOM_AGENTS 不是合法 JSON：", e);
    return [];
  }
}
