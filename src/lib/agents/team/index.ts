import { BUILTIN_PROFILES } from "../../types";
import { type CustomAgentConfig, defineCustomAgent } from "../core/factories";
import type { Agent } from "../core/types";
import { architect } from "./architect";
import { engineer } from "./engineer";
import { leader } from "./leader";
import { pm } from "./pm";

export const isBuiltinAgent = (id: string) => id in BUILTIN_PROFILES;

/**
 * 组装团队：内置成员按 负责人 → 产品 → 架构 → 工程 排列，
 * 自定义智能体插入到其声明的位置之后，工程师永远最后出场。
 */
export function buildTeam(custom: CustomAgentConfig[] = []): Agent[] {
  const team: Agent[] = [leader, pm, architect];
  for (const cfg of custom) {
    const agent = defineCustomAgent(cfg);
    if (isBuiltinAgent(agent.id) || team.some((a) => a.id === agent.id)) {
      throw new Error(`智能体 id 重复：${agent.id}`);
    }
    // 插到同一锚点下已有自定义成员之后，保持声明顺序
    let idx = team.findIndex((a) => a.id === agent.after);
    while (idx + 1 < team.length && !isBuiltinAgent(team[idx + 1].id)) idx++;
    team.splice(idx + 1, 0, agent);
  }
  return [...team, engineer];
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
