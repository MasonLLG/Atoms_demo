/**
 * 公开环境变量校验：缺失时给出明确的中文提示，而不是在 SDK 深处报 "Invalid URL"。
 * 注意：Next.js 只会内联字面量形式的 process.env.NEXT_PUBLIC_*，这里不能用动态 key。
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`缺少环境变量 ${missing.join("、")}，请参考 .env.example 配置后重新部署`);
  }
  return { url: url!, anonKey: anonKey! };
}
