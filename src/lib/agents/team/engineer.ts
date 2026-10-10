import { AppError } from "../../errors";
import { BUILTIN_PROFILES } from "../../types";
import { saveVersion } from "../../versions";
import type { Agent, AgentContext } from "../core/types";
import { applyPatches, extractHtml, extractSummary, FILE_START, parsePatches } from "../extract";
import {
  ENGINEER_CREATE_SYSTEM,
  ENGINEER_EDIT_SYSTEM,
  ENGINEER_REWRITE_SYSTEM,
  engineerCreateUser,
  engineerEditUser,
} from "../prompts";
import type { Design, Prd } from "../schemas";

function withNotes(input: string, ctx: AgentContext) {
  if (ctx.notes.length === 0) return input;
  const notes = ctx.notes.map((n) => `【${n.agentName}】\n${n.content}`).join("\n\n");
  return `${input}\n\n其他团队成员的建议（请在实现中采纳）：\n${notes}`;
}

/**
 * 工程师：首次生成时流式输出整文件；迭代时输出 SEARCH/REPLACE 补丁，打不上则回退为整文件重写。
 * 产出的代码保存为新版本。
 */
export const engineer: Agent = {
  id: "engineer",
  profile: BUILTIN_PROFILES.engineer,
  startStatus: "正在编写代码",
  async run(ctx, io) {
    let html: string | null;
    let summary: string;

    if (ctx.flow === "create" || !ctx.currentHtml) {
      const user = engineerCreateUser(ctx.prompt, ctx.artifacts.pm as Prd, ctx.artifacts.architect as Design);
      const out = await io.stream(ENGINEER_CREATE_SYSTEM, withNotes(user, ctx));
      html = extractHtml(out);
      summary = extractSummary(out) || "完成第一版开发";
    } else {
      io.status("正在修改代码");
      const user = withNotes(engineerEditUser(ctx.prompt, ctx.currentHtml, ctx.history), ctx);
      const out = await io.stream(ENGINEER_EDIT_SYSTEM, user);
      summary = extractSummary(out) || "根据反馈完成修改";
      html = null;
      if (out.includes(FILE_START)) {
        html = extractHtml(out);
      } else {
        const patches = parsePatches(out);
        const res = patches.length > 0 ? applyPatches(ctx.currentHtml, patches) : null;
        if (res?.ok) html = res.html;
      }
      if (!html) {
        io.status("补丁未能精确应用，改为整文件重写");
        const full = await io.stream(ENGINEER_REWRITE_SYSTEM, user);
        html = extractHtml(full);
        summary = extractSummary(full) || summary;
      }
    }
    if (!html) throw new AppError("LLM_BAD_OUTPUT", "工程师没有输出有效的 HTML，请重试");

    const version = await saveVersion(io.supabase, ctx.project.id, ctx.userId, html, summary, "agent").catch((e) => {
      throw new AppError("DB_ERROR", undefined, { cause: e });
    });
    ctx.output = { html, summary, versionId: version.id, versionNumber: version.number };
    io.emit({ type: "version_saved", version: { ...version, summary, html } });
    return { content: summary, versionId: version.id };
  },
};
