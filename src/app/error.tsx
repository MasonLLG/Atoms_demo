"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 页面级错误兜底：展示具体原因，部署切换导致的资源加载失败会自动刷新一次 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] 页面出错：", error);
    // 新版本部署后旧页面加载不到对应的 JS 分包，刷新一次即可恢复
    if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(error.message)) {
      const key = "atoms:chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-5 text-center">
      <div className="max-w-md">
        <div className="text-lg font-semibold">页面出了点问题</div>
        <p className="mt-2 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-muted">{error.message || "未知错误"}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={reset} className="rounded-lg bg-violet-500 px-4 py-2 text-sm text-white hover:bg-violet-400">
            重试
          </button>
          <Link href="/" className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
