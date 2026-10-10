import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Dashboard, type ProjectCard } from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data } = await supabase
    .from("projects")
    .select("id, name, description, is_public, slug, updated_at, current:versions!fk_current_version(html, number)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const projects: ProjectCard[] = (data ?? []).map((p) => {
    const cur = Array.isArray(p.current) ? p.current[0] : p.current;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      is_public: p.is_public,
      slug: p.slug,
      updated_at: p.updated_at,
      html: cur?.html ?? null,
      versionNumber: cur?.number ?? null,
    };
  });

  return <Dashboard email={user.email ?? ""} isGuest={!!user.is_anonymous} projects={projects} />;
}
