import { BUILTIN_PROFILES } from "../../types";
import { defineJsonAgent } from "../core/factories";
import { PM_SYSTEM } from "../prompts";
import { PrdSchema } from "../schemas";

export const pm = defineJsonAgent({
  id: "pm",
  profile: BUILTIN_PROFILES.pm,
  startStatus: "正在撰写需求文档",
  when: (ctx) => ctx.flow === "create",
  schema: PrdSchema,
  system: PM_SYSTEM,
  input: (ctx) => ctx.prompt,
  async commit(ctx, prd, io) {
    await io.supabase
      .from("projects")
      .update({ name: prd.appName, description: prd.summary, updated_at: new Date().toISOString() })
      .eq("id", ctx.project.id);
    io.emit({ type: "project", name: prd.appName, description: prd.summary });
  },
  summarize: (prd) => `需求文档已完成：「${prd.appName}」，${prd.summary}`,
});
