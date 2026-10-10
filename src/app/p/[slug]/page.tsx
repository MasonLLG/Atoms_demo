import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicApp } from "./PublicApp";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, current:versions!fk_current_version(html, number)")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (!data) return null;
  const cur = Array.isArray(data.current) ? data.current[0] : data.current;
  if (!cur) return null;
  return { id: data.id, name: data.name, description: data.description, html: cur.html as string };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const app = await load((await params).slug);
  return { title: app ? `${app.name} · Atoms Demo` : "应用不存在" };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await load(slug);
  if (!app) notFound();
  return <PublicApp slug={slug} app={app} />;
}
