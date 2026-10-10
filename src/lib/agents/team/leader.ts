import { BUILTIN_PROFILES } from "../../types";
import { defineStaticAgent } from "../core/factories";

export const leader = defineStaticAgent({
  id: "leader",
  profile: BUILTIN_PROFILES.leader,
  startStatus: "分派任务",
  when: (ctx) => ctx.flow === "create",
  message: (ctx) => {
    const members = ctx.team.filter((m) => m.id !== "leader").map((m) => `${m.profile.name}（${m.profile.title}）`);
    return `收到需求！本次由 ${members.join(" → ")} 依次接力完成，我会盯着整个进度。`;
  },
});
