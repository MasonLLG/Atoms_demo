import type { GenEvent } from "./agents/events";

/** 前端可识别的生成错误：带错误码、是否可重试、请求 id（便于对照服务端日志） */
export class GenerateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

/** 读取 /api/generate 的 SSE 流；流在收到 done 之前结束视为连接中断 */
export async function streamGenerate(
  body: { projectId: string; prompt: string },
  onEvent: (e: GenEvent) => void,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new GenerateError("网络连接失败，请检查网络后重试", "NETWORK", true);
  }
  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  if (!res.ok || !res.body) {
    const payload = await res.json().catch(() => null);
    const err = payload?.error;
    throw new GenerateError(err?.message || `请求失败（${res.status}）`, err?.code || "HTTP", err?.retryable ?? res.status >= 500, requestId);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue; // 心跳等注释行
          const event = JSON.parse(line.slice(6)) as GenEvent;
          if (event.type === "done") finished = true;
          onEvent(event);
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new GenerateError("与服务器的连接中断，请重试", "STREAM_INTERRUPTED", true, requestId);
  }
  if (!finished) {
    throw new GenerateError("与服务器的连接意外中断（可能是网络波动或服务超时），请重试", "STREAM_INTERRUPTED", true, requestId);
  }
}
