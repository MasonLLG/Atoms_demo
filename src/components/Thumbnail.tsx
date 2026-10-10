"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPreviewDoc, loadAppData } from "@/lib/runtime";

/** 用缩放的沙箱 iframe 渲染应用缩略图（带上该项目的本地应用数据） */
export function Thumbnail({ html, scope }: { html: string | null; scope: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const doc = useMemo(() => (html && mounted ? buildPreviewDoc(html, loadAppData(scope)) : null), [html, scope, mounted]);
  if (!html) {
    return <div className="grid h-full place-items-center text-xs text-muted">尚未生成</div>;
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {doc && (
        <iframe
          srcDoc={doc}
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: "400%", height: "400%", transform: "scale(0.25)" }}
        />
      )}
    </div>
  );
}
