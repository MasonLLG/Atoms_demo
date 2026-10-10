"use client";

import { AlertTriangle, GitCommitHorizontal, RotateCw } from "lucide-react";
import type { Design, Prd } from "@/lib/agents/schemas";
import { type AgentProfileView, type MessageRole, resolveProfile } from "@/lib/types";
import { DesignCard, NotesCard, PrdCard } from "./cards";

export interface ChatItem {
  id: string;
  role: MessageRole;
  content: string;
  data?: unknown;
  versionId?: string | null;
  versionNumber?: number | null;
  streaming?: boolean;
  status?: string;
  streamText?: string;
  error?: boolean;
  /** 流式过程中由 agent_start 事件带来的智能体形象 */
  profile?: AgentProfileView;
  /** 出错时可以重试的原始需求 */
  retryPrompt?: string;
  requestId?: string;
}

export function MessageBubble({
  item,
  onOpenVersion,
  onRetry,
}: {
  item: ChatItem;
  onOpenVersion?: (id: string) => void;
  onRetry?: (prompt: string) => void;
}) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-violet-500/90 px-3.5 py-2 text-sm text-white">{item.content}</div>
      </div>
    );
  }
  if (item.role === "system") {
    return (
      <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${item.error ? "bg-red-500/10 text-red-300" : "bg-white/5 text-muted"}`}>
        {item.error && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <span className="whitespace-pre-wrap">{item.content}</span>
          {item.requestId && <span className="ml-1 font-mono text-[10px] opacity-60">#{item.requestId}</span>}
        </div>
        {item.retryPrompt && onRetry && (
          <button
            onClick={() => onRetry(item.retryPrompt!)}
            className="flex shrink-0 items-center gap-1 rounded-md bg-red-500/20 px-2 py-0.5 font-medium hover:bg-red-500/30"
          >
            <RotateCw className="h-3 w-3" /> 重试
          </button>
        )}
      </div>
    );
  }

  const agent = resolveProfile(item.role, item.data, item.profile);
  const lines = item.streamText ? item.streamText.split("\n").length : 0;
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: agent.color }}>
        {agent.avatar}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">
          <span className="font-medium text-fg/90">{agent.name}</span> · {agent.title}
        </div>
        {item.streaming ? (
          <div className="mt-1 text-sm text-muted">
            <span className="inline-flex items-center gap-2">
              {item.status}
              <span className="dot-pulse inline-flex gap-0.5">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>
            </span>
            {item.streamText && (
              <div className="mt-1.5 rounded-md border border-line bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-emerald-300/80">
                已写 {lines} 行
                <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-all text-muted/80">{item.streamText.slice(-240)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{item.content}</div>
        )}
        {item.role === "pm" && isPrd(item.data) && <PrdCard prd={item.data} />}
        {item.role === "architect" && isDesign(item.data) && <DesignCard design={item.data} />}
        {hasRecommendations(item.data) && <NotesCard title={`💡 ${agent.name} 的建议`} items={item.data.recommendations} />}
        {item.versionId && item.versionNumber && (
          <button
            onClick={() => onOpenVersion?.(item.versionId!)}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-muted hover:border-violet-500/60 hover:text-fg"
          >
            <GitCommitHorizontal className="h-3.5 w-3.5" /> 版本 v{item.versionNumber}
          </button>
        )}
      </div>
    </div>
  );
}

function isPrd(d: unknown): d is Prd {
  return !!d && typeof d === "object" && "features" in d && "appName" in d;
}
function isDesign(d: unknown): d is Design {
  return !!d && typeof d === "object" && "components" in d && "style" in d;
}
function hasRecommendations(d: unknown): d is { recommendations: string[] } {
  return !!d && typeof d === "object" && Array.isArray((d as { recommendations?: unknown }).recommendations);
}
