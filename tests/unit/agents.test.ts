import { describe, expect, it } from "vitest";
import { defineCustomAgent } from "../../src/lib/agents/core/factories";
import type { GenEvent } from "../../src/lib/agents/events";
import type { LLM } from "../../src/lib/agents/llm";
import { mockJson, mockStream } from "../../src/lib/agents/mock";
import { runGeneration } from "../../src/lib/agents/orchestrator";
import { buildTeam } from "../../src/lib/agents/team";
import type { Project } from "../../src/lib/types";

const reviewer = {
  id: "a11y",
  name: "Iris",
  title: "无障碍顾问",
  instructions: "检查可访问性：对比度、键盘操作、语义化标签。",
  after: "architect" as const,
};

describe("buildTeam", () => {
  it("内置顺序为 负责人 → 产品 → 架构 → 工程", () => {
    expect(buildTeam().map((a) => a.id)).toEqual(["leader", "pm", "architect", "engineer"]);
  });

  it("自定义智能体插入到声明的位置，同一锚点按声明顺序排列", () => {
    const team = buildTeam([
      { ...reviewer, id: "copy", after: "pm" },
      reviewer,
      { ...reviewer, id: "perf" },
    ]);
    expect(team.map((a) => a.id)).toEqual(["leader", "pm", "copy", "architect", "a11y", "perf", "engineer"]);
  });

  it("拒绝重复 id 与非法配置", () => {
    expect(() => buildTeam([{ ...reviewer, id: "pm" }])).toThrow(/重复/);
    expect(() => buildTeam([reviewer, reviewer])).toThrow(/重复/);
    expect(() => defineCustomAgent({ ...reviewer, id: "Bad Id" })).toThrow();
  });
});

function fakeSupabase() {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    let op = "select";
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      insert(row: Record<string, unknown>) {
        op = "insert";
        inserts.push({ table, row });
        return b;
      },
      update: () => {
        op = "update";
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () =>
        Promise.resolve({
          data: op === "insert" && table === "versions" ? { id: "ver-1", number: 1, created_at: "now" } : null,
          error: null,
        }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return b;
  };
  return { client: { from } as never, inserts };
}

describe("runGeneration", () => {
  it("首次生成时按流水线执行，自定义智能体的建议进入工程师上下文", async () => {
    const calls: { system: string; user: string }[] = [];
    const llm: LLM = {
      mode: "mock",
      json: async (system, user) => (calls.push({ system, user }), mockJson(system, user)),
      stream: async (system, user, onDelta) => (calls.push({ system, user }), mockStream(system, user, onDelta)),
    };
    const { client, inserts } = fakeSupabase();
    const events: GenEvent[] = [];
    const project = { id: "p1", user_id: "u1", current_version_id: null } as Project;

    await runGeneration({
      supabase: client,
      llm,
      userId: "u1",
      project,
      prompt: "做一个待办清单",
      emit: (e) => events.push(e),
      team: buildTeam([reviewer]),
    });

    const started = events.filter((e) => e.type === "agent_start").map((e) => (e as { agent: string }).agent);
    expect(started).toEqual(["leader", "pm", "architect", "a11y", "engineer"]);
    expect(events.some((e) => e.type === "version_saved")).toBe(true);

    // 工程师的输入里带上了 Iris 的建议
    const engineerCall = calls.find((c) => c.system.includes("你是 Alex"));
    expect(engineerCall?.user).toContain("Iris（无障碍顾问）");

    // 自定义智能体的形象随消息持久化，内置角色不重复保存
    const msgs = inserts.filter((i) => i.table === "messages").map((i) => i.row);
    expect(msgs.map((m) => m.role)).toEqual(["user", "leader", "pm", "architect", "a11y", "engineer"]);
    expect((msgs.find((m) => m.role === "a11y")?.data as { _agent: { name: string } })._agent.name).toBe("Iris");
    expect(msgs.find((m) => m.role === "engineer")?.version_id).toBe("ver-1");
  });

  it("没有产出版本时报错", async () => {
    const { client } = fakeSupabase();
    const project = { id: "p1", user_id: "u1", current_version_id: null } as Project;
    await expect(
      runGeneration({
        supabase: client,
        llm: { mode: "mock", json: mockJson, stream: mockStream },
        userId: "u1",
        project,
        prompt: "x",
        emit: () => {},
        team: buildTeam().filter((a) => a.id !== "engineer"),
      }),
    ).rejects.toThrow(/没有产出新版本/);
  });
});
