import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Message, Project } from "@/lib/types";
import { Editor, type VersionMeta } from "./Editor";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/project/${id}`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project || project.user_id !== user.id) notFound();

  const [{ data: messages }, { data: versions }] = await Promise.all([
    supabase.from("messages").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    supabase
      .from("versions")
      .select("id, number, summary, source, created_at")
      .eq("project_id", id)
      .order("number", { ascending: false }),
  ]);

  let currentHtml: string | null = null;
  if (project.current_version_id) {
    const { data } = await supabase.from("versions").select("html").eq("id", project.current_version_id).single();
    currentHtml = data?.html ?? null;
  }

  return (
    <Editor
      userId={user.id}
      isGuest={!!user.is_anonymous}
      project={project as Project}
      initialMessages={(messages ?? []) as Message[]}
      initialVersions={(versions ?? []) as VersionMeta[]}
      initialHtml={currentHtml}
    />
  );
}

