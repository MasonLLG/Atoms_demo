import { z } from "zod";
import { schemaForPrompt } from "../schemas";
import type { Agent, AgentContext, AgentIO, AgentProfile, AgentResult } from "./types";

interface BaseSpec {
  id: string;
  profile: AgentProfile;
  startStatus: string;
  when?: (ctx: AgentContext) => boolean;
}

/** 输出结构化 JSON 的智能体：给出 schema、提示词和如何把结果写回上下文 */
export function defineJsonAgent<T>(
  spec: BaseSpec & {
    schema: z.ZodType<T>;
    system: string | ((ctx: AgentContext) => string);
    input: (ctx: AgentContext) => string;
    /** 把结果写入上下文，默认写到 artifacts[id] */
    commit?: (ctx: AgentContext, out: T, io: AgentIO) => void | Promise<void>;
    summarize: (out: T, ctx: AgentContext) => string;
  },
): Agent {
  return {
    id: spec.id,
    profile: spec.profile,
    startStatus: spec.startStatus,
    when: spec.when,
    async run(ctx, io): Promise<AgentResult> {
      const system = typeof spec.system === "function" ? spec.system(ctx) : spec.system;
      const out = await io.json(system, spec.input(ctx), spec.schema);
      ctx.artifacts[spec.id] = out;
      await spec.commit?.(ctx, out, io);
      return { content: spec.summarize(out, ctx), data: out };
    },
  };
}

/** 不调用模型的智能体，如负责分派任务的团队负责人 */
export function defineStaticAgent(spec: BaseSpec & { message: (ctx: AgentContext) => string }): Agent {
  return {
    id: spec.id,
    profile: spec.profile,
    startStatus: spec.startStatus,
    when: spec.when,
    async run(ctx) {
      return { content: spec.message(ctx) };
    },
  };
}

/**
 * 自定义智能体配置：纯数据、可序列化，将来可以存进数据库，由用户在界面上创建。
 * 产出会作为笔记交给后续成员（主要是工程师）参考。
 */
export const CustomAgentConfigSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, "id 只能包含小写字母、数字、- 和 _"),
  name: z.string().min(1).max(20),
  title: z.string().min(1).max(20),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8b5cf6"),
  avatar: z.string().min(1).max(2).optional(),
  description: z.string().max(200).optional(),
  /** 这个智能体的职责与工作方式 */
  instructions: z.string().min(1).max(4000),
  /** 在哪些流程中出场 */
  flows: z.array(z.enum(["create", "edit"])).min(1).default(["create"]),
  /** 插入到哪个内置成员之后 */
  after: z.enum(["leader", "pm", "architect"]).default("architect"),
});
export type CustomAgentConfig = z.input<typeof CustomAgentConfigSchema>;

const CustomOutputSchema = z.object({
  summary: z.string().describe("一句话总结你的意见，展示给用户"),
  recommendations: z.array(z.string()).min(1).max(8).describe("给工程师的具体建议，每条一句"),
});

export function defineCustomAgent(input: CustomAgentConfig): Agent & { after: string } {
  const config = CustomAgentConfigSchema.parse(input);
  const agent = defineJsonAgent({
    id: config.id,
    profile: {
      name: config.name,
      title: config.title,
      color: config.color,
      avatar: config.avatar ?? config.name.slice(0, 1).toUpperCase(),
      description: config.description,
    },
    startStatus: `${config.title}正在工作`,
    when: (ctx) => config.flows.includes(ctx.flow),
    schema: CustomOutputSchema,
    system: `你是 ${config.name}，团队中的${config.title}。
${config.instructions}
你的意见会交给工程师 Alex 实现。只输出一个 json 对象，严格符合下面的 JSON Schema：
${schemaForPrompt(CustomOutputSchema)}`,
    input: (ctx) => {
      const parts = [`用户需求：${ctx.prompt}`];
      if (ctx.artifacts.pm) parts.push(`需求文档：\n${JSON.stringify(ctx.artifacts.pm, null, 2)}`);
      if (ctx.artifacts.architect) parts.push(`技术方案：\n${JSON.stringify(ctx.artifacts.architect, null, 2)}`);
      if (ctx.currentHtml) parts.push(`当前代码（节选）：\n${ctx.currentHtml.slice(0, 6000)}`);
      return parts.join("\n\n");
    },
    commit: (ctx, out) => {
      ctx.notes.push({
        agentId: config.id,
        agentName: `${config.name}（${config.title}）`,
        content: out.recommendations.map((r) => `- ${r}`).join("\n"),
      });
    },
    summarize: (out) => out.summary,
  });
  return { ...agent, after: config.after };
}
