"use client";

import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { CustomAgentConfigSchema } from "@/lib/agents/core/factories";
import { AFTER_LABEL, AGENT_PRESETS, type CustomAgentRow, orderLineup } from "@/lib/agents/custom";
import { createClient } from "@/lib/supabase/client";
import { BUILTIN_PROFILES, type BuiltinAgentId } from "@/lib/types";

type Draft = Omit<CustomAgentRow, "id" | "enabled" | "created_at" | "updated_at">;

const EMPTY: Draft = {
  slug: "",
  name: "",
  title: "",
  color: "#8b5cf6",
  avatar: "",
  description: "",
  instructions: "",
  flows: ["create"],
  after: "architect",
};

interface Props {
  userId: string;
  email: string;
  initialAgents: CustomAgentRow[];
  setupError: string | null;
}

export function AgentManager({ userId, email, initialAgents, setupError }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState(initialAgents);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const lineup = orderLineup(agents.filter((a) => a.enabled).map((a) => ({ ...a, id: a.slug })));

  async function save() {
    if (!editing) return;
    const d = editing.draft;
    const parsed = CustomAgentConfigSchema.safeParse({
      id: d.slug,
      name: d.name,
      title: d.title,
      color: d.color,
      avatar: d.avatar || undefined,
      description: d.description || undefined,
      instructions: d.instructions,
      flows: d.flows,
      after: d.after,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${FIELD_LABEL[String(issue.path[0])] ?? issue.path.join(".")}：${issue.message}`);
      return;
    }
    if (d.slug in BUILTIN_PROFILES) {
      setError("ID 不能与内置成员重名");
      return;
    }
    setBusy(true);
    setError("");
    const row = { ...d, avatar: d.avatar || null, description: d.description || null, updated_at: new Date().toISOString() };
    const res = editing.id
      ? await supabase.from("custom_agents").update(row).eq("id", editing.id).select().single()
      : await supabase.from("custom_agents").insert({ ...row, user_id: userId }).select().single();
    setBusy(false);
    if (res.error) {
      setError(res.error.code === "23505" ? "这个 ID 已经被你的其他智能体使用了" : res.error.message);
      return;
    }
    const saved = res.data as CustomAgentRow;
    setAgents((list) => (editing.id ? list.map((a) => (a.id === saved.id ? saved : a)) : [...list, saved]));
    setEditing(null);
  }

  async function toggle(a: CustomAgentRow) {
    const { error } = await supabase.from("custom_agents").update({ enabled: !a.enabled }).eq("id", a.id);
    if (!error) setAgents((list) => list.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)));
  }

  async function remove(id: string) {
    const { error } = await supabase.from("custom_agents").delete().eq("id", id);
    if (!error) setAgents((list) => list.filter((a) => a.id !== id));
    setConfirmId(null);
  }

  function openNew(preset?: Draft) {
    setError("");
    let draft = preset ? { ...preset } : { ...EMPTY };
    // 模板的 ID 已被占用时自动加后缀
    if (preset && agents.some((a) => a.slug === preset.slug)) draft = { ...draft, slug: `${preset.slug}-${agents.length + 1}` };
    setEditing({ id: null, draft });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Logo href="/dashboard" />
          <span className="hidden text-sm text-muted sm:inline">{email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> 返回工作台
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">我的智能体</h1>
            <p className="mt-1 text-sm text-muted">为你的 AI 团队招募新成员。智能体只属于你的账号，启用后会参与你所有项目的生成，它们的建议会交给 Alex 落地。</p>
          </div>
          <button
            onClick={() => openNew()}
            disabled={!!setupError}
            className="flex items-center gap-1 rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> 新建智能体
          </button>
        </div>

        {setupError && <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{setupError}</div>}

        {/* 出场顺序 */}
        <section className="mt-6 rounded-xl border border-line bg-panel p-4">
          <div className="text-xs text-muted">首次生成时的出场顺序</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {lineup.map((x, i) => {
              const p = typeof x === "string" ? BUILTIN_PROFILES[x as BuiltinAgentId] : { ...x, avatar: x.avatar || x.name.slice(0, 1) };
              const custom = typeof x !== "string";
              return (
                <div key={typeof x === "string" ? x : x.id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted/50">→</span>}
                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${custom ? "border-violet-500/50 bg-violet-500/10" : "border-line"}`}
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: p.color }}>
                      {p.avatar}
                    </span>
                    {p.name}
                    <span className="text-muted">{p.title}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 列表 */}
        <section className="mt-6">
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-sm text-muted">还没有自定义智能体，从模板开始试试：</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {AGENT_PRESETS.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => openNew(p)}
                    disabled={!!setupError}
                    className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:border-violet-500/60 hover:text-fg disabled:opacity-40"
                  >
                    {p.name} · {p.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.map((a) => (
                <div key={a.id} className={`rounded-xl border border-line bg-panel p-4 ${a.enabled ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: a.color }}>
                      {a.avatar || a.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-muted">{a.title}</span>
                        <code className="rounded bg-black/30 px-1 text-[10px] text-muted">{a.slug}</code>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">{a.description || a.instructions}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                        <span className="rounded bg-white/5 px-1.5 py-0.5">{AFTER_LABEL[a.after]}</span>
                        {a.flows.map((f) => (
                          <span key={f} className="rounded bg-white/5 px-1.5 py-0.5">
                            {f === "create" ? "首次生成" : "迭代修改"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={a.enabled}
                      aria-label={`${a.enabled ? "停用" : "启用"} ${a.name}`}
                      onClick={() => toggle(a)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition ${a.enabled ? "bg-violet-500" : "bg-white/15"}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </div>
                  <div className="mt-3 flex justify-end gap-1 text-xs">
                    {confirmId === a.id ? (
                      <>
                        <button onClick={() => remove(a.id)} className="rounded bg-red-500 px-2 py-1 text-white">
                          确认删除
                        </button>
                        <button onClick={() => setConfirmId(null)} className="rounded px-2 py-1 text-muted hover:text-fg">
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setError("");
                            setEditing({ id: a.id, draft: { ...a, avatar: a.avatar ?? "", description: a.description ?? "" } });
                          }}
                          className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-white/5 hover:text-fg"
                        >
                          <Pencil className="h-3.5 w-3.5" /> 编辑
                        </button>
                        <button
                          onClick={() => setConfirmId(a.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-white/5 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {editing && (
        <AgentForm
          draft={editing.draft}
          isNew={!editing.id}
          error={error}
          busy={busy}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onPreset={(p) => setEditing({ ...editing, draft: { ...p } })}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  id: "ID",
  name: "名字",
  title: "头衔",
  color: "颜色",
  avatar: "头像字",
  description: "简介",
  instructions: "职责说明",
  flows: "出场流程",
  after: "出场位置",
};

function AgentForm(props: {
  draft: Draft;
  isNew: boolean;
  error: string;
  busy: boolean;
  onChange: (d: Draft) => void;
  onPreset: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { draft: d, onChange } = props;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...d, [k]: v });
  const input = "mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-violet-500";

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60" onClick={props.onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave();
        }}
        className="flex h-full w-full max-w-lg flex-col border-l border-line bg-panel"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-medium">{props.isNew ? "新建智能体" : "编辑智能体"}</h2>
          <button type="button" onClick={props.onCancel} aria-label="关闭" className="rounded p-1 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
          {props.isNew && (
            <div>
              <span className="text-xs text-muted">从模板开始</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {AGENT_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.slug}
                    onClick={() => props.onPreset(p)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-violet-500/60 hover:text-fg"
                  >
                    {p.name} · {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted">名字</span>
              <input className={input} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Iris" maxLength={20} />
            </label>
            <label className="block">
              <span className="text-xs text-muted">头衔</span>
              <input className={input} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="无障碍顾问" maxLength={20} />
            </label>
            <label className="block">
              <span className="text-xs text-muted">ID（小写字母开头，可含数字、- 和 _）</span>
              <input
                className={`${input} font-mono`}
                value={d.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase())}
                placeholder="a11y"
                maxLength={32}
                disabled={!props.isNew}
              />
            </label>
            <div className="flex gap-3">
              <label className="block">
                <span className="text-xs text-muted">颜色</span>
                <input type="color" className="mt-1 h-[38px] w-14 cursor-pointer rounded-lg border border-line bg-panel-2" value={d.color} onChange={(e) => set("color", e.target.value)} />
              </label>
              <label className="block flex-1">
                <span className="text-xs text-muted">头像字</span>
                <input className={input} value={d.avatar ?? ""} onChange={(e) => set("avatar", e.target.value)} placeholder="I" maxLength={2} />
              </label>
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-muted">简介（可选）</span>
            <input className={input} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={200} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">职责说明：它会从什么角度给工程师提建议</span>
            <textarea
              className={`${input} min-h-32 resize-y`}
              value={d.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="例如：从可访问性角度审查方案，关注颜色对比度、键盘操作、语义化标签……"
              maxLength={4000}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted">出场位置</span>
              <select className={input} value={d.after} onChange={(e) => set("after", e.target.value as Draft["after"])}>
                {(Object.keys(AFTER_LABEL) as Draft["after"][]).map((k) => (
                  <option key={k} value={k}>
                    {AFTER_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <span className="text-xs text-muted">参与的流程</span>
              <div className="mt-2 flex gap-3 text-sm">
                {(["create", "edit"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={d.flows.includes(f)}
                      onChange={(e) => set("flows", e.target.checked ? [...d.flows, f] : d.flows.filter((x) => x !== f))}
                    />
                    {f === "create" ? "首次生成" : "迭代修改"}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {props.error && <p className="text-sm text-red-400">{props.error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={props.onCancel} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg">
            取消
          </button>
          <button disabled={props.busy} className="rounded-lg bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-60">
            {props.busy ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
