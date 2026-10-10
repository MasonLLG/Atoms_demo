export type BuiltinAgentId = "leader" | "pm" | "architect" | "engineer";
/** user / system，或某个智能体的 id（内置或自定义） */
export type MessageRole = "user" | "system" | BuiltinAgentId | (string & {});

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  current_version_id: string | null;
  is_public: boolean;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface Version {
  id: string;
  project_id: string;
  number: number;
  html: string;
  summary: string | null;
  source: "agent" | "manual" | "restore" | "remix";
  created_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  role: MessageRole;
  content: string;
  data: unknown;
  version_id: string | null;
  created_at: string;
}

export interface AgentProfileView {
  name: string;
  title: string;
  color: string;
  avatar: string;
}

export const BUILTIN_PROFILES: Record<BuiltinAgentId, AgentProfileView> = {
  leader: { name: "Mike", title: "团队负责人", color: "#f59e0b", avatar: "M" },
  pm: { name: "Emma", title: "产品经理", color: "#ec4899", avatar: "E" },
  architect: { name: "Bob", title: "架构师", color: "#3b82f6", avatar: "B" },
  engineer: { name: "Alex", title: "工程师", color: "#10b981", avatar: "A" },
};

const FALLBACK_PROFILE: AgentProfileView = { name: "Agent", title: "智能体", color: "#8b5cf6", avatar: "?" };

/** 解析消息对应的智能体形象：内置角色查表，自定义智能体读取随消息保存的 _agent */
export function resolveProfile(role: string, data?: unknown, fallback?: AgentProfileView): AgentProfileView {
  if (role in BUILTIN_PROFILES) return BUILTIN_PROFILES[role as BuiltinAgentId];
  const saved = data && typeof data === "object" ? (data as { _agent?: AgentProfileView })._agent : undefined;
  return saved ?? fallback ?? FALLBACK_PROFILE;
}
