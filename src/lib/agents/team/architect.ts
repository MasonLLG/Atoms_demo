import { BUILTIN_PROFILES } from "../../types";
import { defineJsonAgent } from "../core/factories";
import { ARCHITECT_SYSTEM } from "../prompts";
import { DesignSchema } from "../schemas";

export const architect = defineJsonAgent({
  id: "architect",
  profile: BUILTIN_PROFILES.architect,
  startStatus: "正在设计技术方案",
  when: (ctx) => ctx.flow === "create",
  schema: DesignSchema,
  system: ARCHITECT_SYSTEM,
  input: (ctx) => `用户原始需求：${ctx.prompt}\n\n需求文档：\n${JSON.stringify(ctx.artifacts.pm, null, 2)}`,
  summarize: (d) => `技术方案已完成：${d.style.theme}风格，拆分为 ${d.components.length} 个模块。`,
});
