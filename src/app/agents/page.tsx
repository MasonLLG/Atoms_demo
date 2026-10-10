import { redirect } from "next/navigation";
import type { CustomAgentRow } from "@/lib/agents/custom";
import { createClient } from "@/lib/supabase/server";
import { AgentManager } from "./AgentManager";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agents");

  const { data, error } = await supabase
    .from("custom_agents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <AgentManager
      userId={user.id}
      email={user.is_anonymous ? "游客" : (user.email ?? "")}
      initialAgents={(data ?? []) as CustomAgentRow[]}
      setupError={error ? "数据库还没有自定义智能体表，请先执行 supabase/migrations/003_user_custom_agents.sql" : null}
    />
  );
}
