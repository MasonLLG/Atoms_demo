import { z } from "zod";
import { BUILTIN_PROFILES } from "../../types";
import type { Agent, AgentContext } from "../core/types";
import { schemaForPrompt } from "../schemas";

export const IntentSchema = z.object({
  intent: z.enum(["build", "chat"]).describe("build：要开始开发或修改应用；chat：打招呼、闲聊、提问或信息不足"),
  reply: z.string().describe("给用户的回复，简体中文，口语化，不超过 120 字"),
});
export type Intent = z.infer<typeof IntentSchema>;

const SYSTEM = `你是 Mike，一个 AI 软件团队的负责人。团队可以根据用户描述，生成可在浏览器中运行的单文件网页应用（工具、小游戏、管理类应用等），并根据反馈继续修改。
你的任务是判断用户这条消息的意图：
- build：用户描述了想做的应用，或者对当前应用提出了修改要求。哪怕很简短也算，例如"做个计算器"、"贪吃蛇"、"把按钮改成红色"、"加一个深色模式"。
- chat：打招呼、闲聊、询问团队能做什么、询问当前应用怎么用或代码原理，或者内容太模糊无法判断要做什么（例如"你好"、"在吗"、"你们能做什么"、"这个怎么用"）。
回复要求：
- build：一句话确认你理解的需求，说明马上安排团队开工。不要列出成员名单。
- chat：直接友好地回答。如果用户还没说要做什么，给出 2 到 3 个具体的应用点子供选择。回答关于当前应用的问题时，基于提供的代码作答，不要编造。
只输出一个 json 对象，严格符合下面的 JSON Schema：
${schemaForPrompt(IntentSchema)}`;

function input(ctx: AgentContext) {
  const parts = [`当前阶段：${ctx.flow === "create" ? "项目还没有任何代码" : "已有一个可运行的应用，用户可能想修改它或询问它"}`];
  if (ctx.history) parts.push(`最近的对话：\n${ctx.history}`);
  if (ctx.currentHtml) parts.push(`当前应用代码（节选）：\n${ctx.currentHtml.slice(0, 4000)}`);
  parts.push(`用户的新消息：${ctx.prompt}`);
  return parts.join("\n\n");
}

/**
 * 团队负责人：先判断意图再分派。
 * 闲聊或提问时直接回答并结束流水线（不产生新版本、不消耗后续成员的调用）；
 * 要开发时说明本次出场的成员，交给后续流水线。
 */
export const leader: Agent = {
  id: "leader",
  profile: BUILTIN_PROFILES.leader,
  startStatus: "理解需求中",
  async run(ctx, io) {
    const out = await io.json(SYSTEM, input(ctx), IntentSchema);
    ctx.artifacts.leader = out;
    if (out.intent === "chat") return { content: out.reply, halt: true };

    const members = ctx.team.filter((m) => m.id !== "leader").map((m) => `${m.profile.name}（${m.profile.title}）`);
    const plan = members.length > 1 ? `本次由 ${members.join(" → ")} 依次接力完成。` : `交给 ${members[0]} 处理。`;
    return { content: `${out.reply}\n${plan}` };
  },
};
