"use client";

import {
  ArrowLeft,
  ArrowUp,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  History,
  Monitor,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Square,
  Wrench,
} from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GuestBanner } from "@/components/BindAccount";
import { MessageBubble, type ChatItem } from "@/components/chat/MessageBubble";
import { CodeEditor } from "@/components/CodeEditor";
import { Preview } from "@/components/Preview";
import type { GenEvent } from "@/lib/agents/events";
import { extractHtml } from "@/lib/agents/extract";
import { saveAppData } from "@/lib/runtime";
import { GenerateError, streamGenerate } from "@/lib/sse";
import { createClient } from "@/lib/supabase/client";
import type { Message, Project } from "@/lib/types";
import { saveVersion } from "@/lib/versions";

export interface VersionMeta {
  id: string;
  number: number;
  summary: string | null;
  source: string;
  created_at: string;
}

interface Props {
  userId: string;
  isGuest: boolean;
  project: Project;
  initialMessages: Message[];
  initialVersions: VersionMeta[];
  initialHtml: string | null;
}

const SOURCE_LABEL: Record<string, string> = { agent: "AI 生成", manual: "手动编辑", restore: "版本恢复", remix: "Remix" };

export function Editor({ userId, isGuest, project: initialProject, initialMessages, initialVersions, initialHtml }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [project, setProject] = useState(initialProject);
  const [versions, setVersions] = useState(initialVersions);
  const [items, setItems] = useState<ChatItem[]>(() => {
    const numberOf = new Map(initialVersions.map((v) => [v.id, v.number]));
    return initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      data: m.data,
      versionId: m.version_id,
      versionNumber: m.version_id ? numberOf.get(m.version_id) : null,
    }));
  });

  // 当前（最新）版本代码
  const [html, setHtml] = useState<string | null>(initialHtml);
  // 正在查看的历史版本
  const [viewing, setViewing] = useState<{ id: string; number: number; html: string } | null>(null);
  // 流式生成中的代码
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "preview">("chat");
  const [toast, setToast] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastPreviewAt = useRef(0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const shownHtml = viewing?.html ?? html;
  const currentNumber = versions[0]?.number ?? null;

  const updateLast = useCallback((agent: string, fn: (it: ChatItem) => ChatItem) => {
    setItems((list) => {
      const idx = list.findLastIndex((it) => it.role === agent && it.streaming);
      if (idx < 0) return list;
      const next = list.slice();
      next[idx] = fn(next[idx]);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || running) return;
      setInput("");
      setRunning(true);
      setErrors([]);
      setViewing(null);
      setDraft(null);
      setMobilePane("chat");
      setItems((l) => [...l, { id: nanoid(), role: "user", content: prompt }]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let flow: "create" | "edit" = "create";
      let failed = false;
      let engineerText = "";

      const onEvent = (e: GenEvent) => {
        switch (e.type) {
          case "meta":
            setMode(e.mode);
            flow = e.flow;
            break;
          case "agent_start":
            setItems((l) => [...l, { id: nanoid(), role: e.agent, content: "", streaming: true, status: e.status, profile: e.profile }]);
            if (e.agent === "engineer") engineerText = "";
            break;
          case "status":
            updateLast(e.agent, (it) => ({ ...it, status: e.status, streamText: "" }));
            engineerText = "";
            break;
          case "delta":
            updateLast(e.agent, (it) => ({ ...it, streamText: (it.streamText ?? "") + e.text }));
            if (e.agent === "engineer") {
              engineerText += e.text;
              const partial = extractHtml(engineerText, false);
              if (partial) {
                setLiveCode(partial);
                // 首次生成时边写边预览（节流），迭代修改时补丁无法直接预览
                if (flow === "create" && Date.now() - lastPreviewAt.current > 1500) {
                  lastPreviewAt.current = Date.now();
                  setLivePreview(partial);
                }
              } else if (flow === "edit") {
                setLiveCode(engineerText);
              }
            }
            break;
          case "agent_done":
            updateLast(e.agent, (it) => ({ ...it, streaming: false, content: e.content, data: e.data, streamText: undefined }));
            break;
          case "project":
            setProject((p) => ({ ...p, name: e.name, description: e.description }));
            break;
          case "version_saved": {
            const v = e.version;
            setHtml(v.html);
            setVersions((vs) => [{ id: v.id, number: v.number, summary: v.summary, source: "agent", created_at: v.created_at }, ...vs]);
            setProject((p) => ({ ...p, current_version_id: v.id }));
            setItems((l) => {
              const idx = l.findLastIndex((it) => it.role === "engineer");
              if (idx < 0) return l;
              const next = l.slice();
              next[idx] = { ...next[idx], versionId: v.id, versionNumber: v.number };
              return next;
            });
            setTab("preview");
            setMobilePane("preview");
            break;
          }
          case "error":
            failed = true;
            setItems((l) => [
              ...l.map((it) => (it.streaming ? { ...it, streaming: false, content: "已中断", streamText: undefined } : it)),
              {
                id: nanoid(),
                role: "system",
                content: e.code === "CANCELLED" ? e.message : `生成失败：${e.message}`,
                error: e.code !== "CANCELLED",
                retryPrompt: e.retryable ? prompt : undefined,
                requestId: e.code === "CANCELLED" ? undefined : e.requestId,
              },
            ]);
            break;
        }
      };

      try {
        await streamGenerate({ projectId: project.id, prompt }, onEvent, ctrl.signal);
      } catch (err) {
        const aborted = (err as Error).name === "AbortError";
        const ge = err instanceof GenerateError ? err : null;
        if (!failed) {
          setItems((l) => [
            ...l.map((it) => (it.streaming ? { ...it, streaming: false, content: aborted ? "已停止" : "已中断", streamText: undefined } : it)),
            {
              id: nanoid(),
              role: "system",
              content: aborted ? "已停止生成" : (err as Error).message || "生成失败，请重试",
              error: !aborted,
              retryPrompt: aborted || ge?.retryable !== false ? prompt : undefined,
              requestId: ge?.requestId,
            },
          ]);
        }
      } finally {
        setRunning(false);
        setLiveCode(null);
        setLivePreview(null);
        abortRef.current = null;
      }
    },
    [project.id, running, updateLast],
  );

  // 从首页 / 模板创建的项目：进入后自动发送需求
  useEffect(() => {
    const key = `atoms:autosend:${project.id}`;
    const pending = sessionStorage.getItem(key);
    if (pending) {
      sessionStorage.removeItem(key);
      if (items.length === 0) send(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPreviewError = useCallback((msg: string) => {
    setErrors((es) => (es.includes(msg) || es.length >= 5 ? es : [...es, msg]));
  }, []);

  async function openVersion(id: string) {
    setShowVersions(false);
    setDraft(null);
    setErrors([]);
    if (id === project.current_version_id) {
      setViewing(null);
      return;
    }
    const { data } = await supabase.from("versions").select("id, number, html").eq("id", id).single();
    if (data) {
      setViewing(data);
      setTab("preview");
      setMobilePane("preview");
    }
  }

  async function commitHtml(newHtml: string, summary: string, source: "manual" | "restore") {
    try {
      const v = await saveVersion(supabase, project.id, userId, newHtml, summary, source);
      const { error } = await supabase
        .from("messages")
        .insert({ project_id: project.id, user_id: userId, role: "system", content: summary, version_id: v.id });
      if (error) throw error;
      setHtml(newHtml);
      setVersions((vs) => [{ id: v.id, number: v.number, summary, source, created_at: v.created_at }, ...vs]);
      setProject((p) => ({ ...p, current_version_id: v.id }));
      setItems((l) => [...l, { id: nanoid(), role: "system", content: `${summary}（v${v.number}）` }]);
      setViewing(null);
      setDraft(null);
      setToast(`已保存为 v${v.number}`);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  async function togglePublish() {
    const next = !project.is_public;
    const slug = project.slug || nanoid(10);
    const { error } = await supabase.from("projects").update({ is_public: next, slug }).eq("id", project.id);
    if (error) return setToast(error.message);
    setProject((p) => ({ ...p, is_public: next, slug }));
  }

  const shareUrl = typeof window !== "undefined" && project.slug ? `${window.location.origin}/p/${project.slug}` : "";

  function exportHtml() {
    if (!shownHtml) return;
    const blob = new Blob([shownHtml], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name || "app"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const codeValue = liveCode ?? draft ?? shownHtml ?? "";
  const previewHtml = running && livePreview ? livePreview : shownHtml;
  const empty = !previewHtml;

  return (
    <div className="flex h-dvh flex-col">
      {/* 顶栏 */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Link href="/dashboard" className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-fg" aria-label="返回工作台">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{project.name}</div>
        </div>
        {isGuest && (
          <span className="hidden sm:inline">
            <GuestBanner compact />
          </span>
        )}
        {mode === "mock" && (
          <span className="hidden rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300 sm:inline" title="服务端未配置 API Key">
            离线演示模型
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowVersions((s) => !s)}
              disabled={versions.length === 0}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-white/5 hover:text-fg disabled:opacity-40"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">{viewing ? `v${viewing.number}` : currentNumber ? `v${currentNumber}` : "版本"}</span>
            </button>
            {showVersions && (
              <div className="absolute right-0 top-9 z-20 max-h-96 w-72 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-2xl scroll-thin">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openVersion(v.id)}
                    className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5 ${
                      (viewing?.id ?? project.current_version_id) === v.id ? "bg-white/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        v{v.number}
                        {v.id === project.current_version_id && <span className="ml-1.5 text-emerald-400">当前</span>}
                      </span>
                      <span className="text-muted">{SOURCE_LABEL[v.source] ?? v.source}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted">{v.summary}</div>
                    <div className="mt-0.5 text-[10px] text-muted/60">{new Date(v.created_at).toLocaleString("zh-CN", { hour12: false })}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={exportHtml}
            disabled={!shownHtml}
            className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-fg disabled:opacity-40"
            title="导出 HTML"
            aria-label="导出 HTML"
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowPublish((s) => !s)}
              disabled={!html}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
                project.is_public ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500 text-white hover:bg-violet-400"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              {project.is_public ? "已发布" : "发布"}
            </button>
            {showPublish && (
              <div className="absolute right-0 top-9 z-20 w-80 rounded-xl border border-line bg-panel p-4 shadow-2xl">
                <div className="text-sm font-medium">发布应用</div>
                <p className="mt-1 text-xs text-muted">发布后，任何人都可以通过链接访问当前版本，并 Remix 到自己的工作区。</p>
                {project.is_public && shareUrl && (
                  <div className="mt-3 flex items-center gap-1 rounded-lg border border-line bg-panel-2 p-1 pl-2">
                    <a href={shareUrl} target="_blank" className="flex-1 truncate text-xs text-violet-300 hover:underline">
                      {shareUrl}
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-fg"
                      aria-label="复制链接"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
                <button
                  onClick={togglePublish}
                  className={`mt-3 w-full rounded-lg py-1.5 text-xs font-medium ${
                    project.is_public ? "bg-white/5 text-muted hover:text-fg" : "bg-violet-500 text-white hover:bg-violet-400"
                  }`}
                >
                  {project.is_public ? "取消发布" : "公开发布"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 移动端切换 */}
      <div className="grid shrink-0 grid-cols-2 border-b border-line text-xs md:hidden">
        {(["chat", "preview"] as const).map((p) => (
          <button key={p} onClick={() => setMobilePane(p)} className={`py-2 ${mobilePane === p ? "border-b-2 border-violet-500 text-fg" : "text-muted"}`}>
            {p === "chat" ? "对话" : "预览"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 对话区 */}
        <aside className={`${mobilePane === "chat" ? "flex" : "hidden"} w-full flex-col border-r border-line md:flex md:w-[400px] md:shrink-0`}>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scroll-thin">
            {items.length === 0 && !running && (
              <div className="pt-10 text-center text-sm text-muted">描述你想要的应用，AI 团队会帮你实现</div>
            )}
            {items.map((it) => (
              <MessageBubble key={it.id} item={it} onOpenVersion={openVersion} onRetry={running ? undefined : send} />
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-line p-3">
            {errors.length > 0 && !running && (
              <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                <div className="flex items-center justify-between">
                  <span>预览中检测到 {errors.length} 个运行错误</span>
                  <button
                    onClick={() => send(`预览运行时出现以下错误，请修复：\n${errors.map((e) => `- ${e}`).join("\n")}`)}
                    className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
                  >
                    <Wrench className="h-3 w-3" /> 让 Alex 修复
                  </button>
                </div>
                <div className="mt-1 line-clamp-2 font-mono text-[11px] text-amber-200/70">{errors[0]}</div>
              </div>
            )}
            <div className="rounded-xl border border-line bg-panel-2 p-2 focus-within:border-violet-500/60">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder={html ? "继续描述你想修改的地方，例如：把主色换成绿色，增加深色模式" : "描述你想要的应用..."}
                className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted/70"
              />
              <div className="flex justify-end">
                {running ? (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/15"
                  >
                    <Square className="h-3 w-3 fill-current" /> 停止
                  </button>
                ) : (
                  <button
                    onClick={() => send(input)}
                    disabled={!input.trim()}
                    aria-label="发送"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* 预览 / 代码区 */}
        <section className={`${mobilePane === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
            {(
              [
                ["preview", Eye, "预览"],
                ["code", Code2, "代码"],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${tab === k ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
            {tab === "preview" && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setDevice(device === "desktop" ? "mobile" : "desktop")}
                  className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-fg"
                  title={device === "desktop" ? "切换到手机尺寸" : "切换到桌面尺寸"}
                  aria-label="切换预览尺寸"
                >
                  {device === "desktop" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setErrors([]);
                    setReloadKey((k) => k + 1);
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-fg"
                  title="刷新预览"
                  aria-label="刷新预览"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    saveAppData(project.id, {});
                    setErrors([]);
                    setReloadKey((k) => k + 1);
                    setToast("已清空应用数据");
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-fg"
                  title="清空生成应用保存在本地的数据"
                >
                  重置数据
                </button>
              </div>
            )}
            {tab === "code" && draft !== null && !running && (
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setDraft(null)} className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg">
                  放弃修改
                </button>
                <button
                  onClick={() => commitHtml(draft, "手动编辑了代码", "manual")}
                  className="rounded-md bg-violet-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-400"
                >
                  保存为新版本
                </button>
              </div>
            )}
          </div>

          {viewing && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-violet-500/10 px-3 py-1.5 text-xs">
              <span>正在查看历史版本 v{viewing.number}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => commitHtml(viewing.html, `恢复到 v${viewing.number}`, "restore")}
                  className="flex items-center gap-1 rounded-md bg-violet-500 px-2 py-1 font-medium text-white hover:bg-violet-400"
                >
                  <RotateCcw className="h-3 w-3" /> 恢复此版本
                </button>
                <button onClick={() => setViewing(null)} className="rounded-md px-2 py-1 text-muted hover:text-fg">
                  返回最新
                </button>
              </div>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            {tab === "preview" ? (
              empty ? (
                <div className="grid h-full place-items-center text-sm text-muted">
                  {running ? "AI 团队正在工作，代码写出后会在这里实时预览" : "还没有可预览的内容"}
                </div>
              ) : (
                <Preview
                  html={previewHtml!}
                  scope={project.id}
                  device={device}
                  reloadKey={reloadKey}
                  streaming={running}
                  onError={onPreviewError}
                />
              )
            ) : (
              <CodeEditor value={codeValue} readOnly={running || !!viewing} onChange={(v) => setDraft(v)} />
            )}
            {running && tab === "preview" && livePreview && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-xs text-white">
                Alex 正在编写代码，预览实时更新中
              </div>
            )}
          </div>
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-white px-3 py-1.5 text-xs text-black shadow-lg">{toast}</div>
      )}
    </div>
  );
}
