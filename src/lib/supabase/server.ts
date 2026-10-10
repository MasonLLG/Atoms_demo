import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "../env";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 在 Server Component 中调用时无法写 cookie，由 middleware 负责刷新会话
          }
        },
      },
    },
  );
}
