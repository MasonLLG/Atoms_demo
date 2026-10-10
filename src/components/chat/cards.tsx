"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Design, Prd } from "@/lib/agents/schemas";

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-line bg-panel-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-fg/90 hover:bg-white/5">
        {title}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line px-3 py-2.5 text-xs leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-rose-500/15 text-rose-300",
  P1: "bg-amber-500/15 text-amber-300",
  P2: "bg-slate-500/20 text-slate-300",
};

export function PrdCard({ prd }: { prd: Prd }) {
  return (
    <Collapsible title={`📄 需求文档 · ${prd.appName}`} defaultOpen>
      <p className="text-fg/80">{prd.summary}</p>
      <p className="mt-1">目标用户：{prd.targetUsers}</p>
      <div className="mt-2 space-y-1.5">
        {prd.features.map((f) => (
          <div key={f.name} className="flex gap-2">
            <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLE[f.priority]}`}>{f.priority}</span>
            <span>
              <span className="text-fg/90">{f.name}</span>：{f.description}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2">页面：{prd.pages.map((p) => p.name).join("、")}</div>
      {prd.dataModel.length > 0 && (
        <div className="mt-1">
          数据：
          {prd.dataModel.map((d) => (
            <code key={d.entity} className="mr-1.5 rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">
              {d.entity}({d.fields.join(", ")})
            </code>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

export function DesignCard({ design }: { design: Design }) {
  return (
    <Collapsible title="🧩 技术方案">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: design.style.primaryColor }} />
        {design.style.theme} · {design.style.layout}
      </div>
      <div className="mt-2 space-y-1">
        {design.components.map((c) => (
          <div key={c.name}>
            <code className="font-mono text-fg/90">{c.name}</code>：{c.responsibility}
          </div>
        ))}
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[11px]">{design.stateShape}</pre>
      {design.implementationNotes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4">
          {design.implementationNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}
