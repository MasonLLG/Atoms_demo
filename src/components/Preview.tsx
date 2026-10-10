"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewDoc, loadAppData, PREVIEW_CHANNEL, type PreviewMessage, saveAppData } from "@/lib/runtime";

interface Props {
  html: string;
  /** 生成应用自身数据的存储作用域（同一项目的所有版本共享数据） */
  scope: string;
  device?: "desktop" | "mobile";
  reloadKey?: number;
  /** 流式生成中：不持久化、不上报错误 */
  streaming?: boolean;
  onError?: (message: string) => void;
}

export function Preview({ html, scope, device = "desktop", reloadKey = 0, streaming = false, onError }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const streamingRef = useRef(streaming);
  // 应用数据存在浏览器 localStorage 里，服务端渲染时读不到，所以只在客户端挂载后渲染 iframe
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    streamingRef.current = streaming;
    onErrorRef.current = onError;
  });

  // 只在 html / 作用域 / 手动刷新时重建文档；流式过程中不读取持久化数据
  const doc = useMemo(
    () => (mounted ? buildPreviewDoc(html, streaming ? {} : loadAppData(scope)) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [html, scope, reloadKey, mounted],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== ref.current?.contentWindow) return;
      const msg = e.data as PreviewMessage;
      if (!msg || msg.channel !== PREVIEW_CHANNEL || streamingRef.current) return;
      if (msg.type === "storage") saveAppData(scope, msg.data);
      if (msg.type === "error") onErrorRef.current?.(msg.message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [scope]);

  if (!mounted) return <div className="h-full w-full bg-white" />;

  const frame = (
    <iframe
      ref={ref}
      title="应用预览"
      srcDoc={doc}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
      className="h-full w-full border-0 bg-white"
    />
  );

  if (device === "mobile") {
    return (
      <div className="grid h-full place-items-center overflow-auto bg-[#0d0d10] p-6">
        <div className="h-[760px] max-h-full w-[390px] overflow-hidden rounded-[2.2rem] border-[10px] border-[#26262c] shadow-2xl">
          {frame}
        </div>
      </div>
    );
  }
  return frame;
}
