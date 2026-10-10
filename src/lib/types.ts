export type AgentRole = "leader" | "pm" | "architect" | "engineer";
export type MessageRole = "user" | AgentRole | "system";

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

export const AGENTS: Record<AgentRole, { name: string; title: string; color: string; avatar: string }> = {
  leader: { name: "Mike", title: "团队负责人", color: "#f59e0b", avatar: "M" },
  pm: { name: "Emma", title: "产品经理", color: "#ec4899", avatar: "E" },
  architect: { name: "Bob", title: "架构师", color: "#3b82f6", avatar: "B" },
  engineer: { name: "Alex", title: "工程师", color: "#10b981", avatar: "A" },
};
