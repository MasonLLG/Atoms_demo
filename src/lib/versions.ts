import type { SupabaseClient } from "@supabase/supabase-js";

/** 写入新版本快照并把它设为项目当前版本（服务端与浏览器端共用） */
export async function saveVersion(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  html: string,
  summary: string,
  source: "agent" | "manual" | "restore" | "remix",
) {
  const { data: last } = await supabase
    .from("versions")
    .select("number")
    .eq("project_id", projectId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = (last?.number ?? 0) + 1;
  const { data, error } = await supabase
    .from("versions")
    .insert({ project_id: projectId, user_id: userId, number, html, summary, source })
    .select("id, number, created_at")
    .single();
  if (error || !data) throw new Error(`保存版本失败：${error?.message ?? "未知错误"}`);
  await supabase
    .from("projects")
    .update({ current_version_id: data.id, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  return data as { id: string; number: number; created_at: string };
}
