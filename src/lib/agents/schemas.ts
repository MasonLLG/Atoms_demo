import { z } from "zod";

// 产品经理 Emma 的结构化产出：需求文档（PRD）
export const PrdSchema = z.object({
  appName: z.string().describe("应用名称，简短，不超过 12 个字"),
  summary: z.string().describe("一句话描述应用解决什么问题"),
  targetUsers: z.string().describe("目标用户"),
  features: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        priority: z.enum(["P0", "P1", "P2"]),
      }),
    )
    .min(1)
    .max(8),
  pages: z.array(z.object({ name: z.string(), purpose: z.string() })).min(1).max(5),
  dataModel: z
    .array(z.object({ entity: z.string(), fields: z.array(z.string()) }))
    .max(5)
    .describe("需要在 localStorage 中持久化的数据实体"),
});
export type Prd = z.infer<typeof PrdSchema>;

// 架构师 Bob 的结构化产出：技术设计
export const DesignSchema = z.object({
  style: z.object({
    theme: z.string().describe("视觉风格，如 简洁浅色 / 深色科技感"),
    primaryColor: z.string().describe("主色，十六进制"),
    layout: z.string().describe("整体布局描述"),
  }),
  components: z
    .array(z.object({ name: z.string(), responsibility: z.string() }))
    .min(1)
    .max(10),
  stateShape: z.string().describe("前端状态结构，用简短的 TypeScript 类型描述"),
  storageKeys: z.array(z.string()).max(6).describe("用到的 localStorage key"),
  implementationNotes: z.array(z.string()).max(6).describe("给工程师的实现要点"),
});
export type Design = z.infer<typeof DesignSchema>;

export function schemaForPrompt(schema: z.ZodType) {
  return JSON.stringify(z.toJSONSchema(schema), null, 2);
}
