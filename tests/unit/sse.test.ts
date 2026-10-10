import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateError, streamGenerate } from "../../src/lib/sse";

function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const body = new ReadableStream({
    start(c) {
      chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "X-Request-Id": "req1" }, ...init });
}

afterEach(() => vi.unstubAllGlobals());

describe("streamGenerate", () => {
  it("解析事件、忽略心跳，并能处理跨分片的事件", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([': ping\n\ndata: {"type":"me', 'ta","mode":"mock","flow":"create"}\n\n', 'data: {"type":"done"}\n\n'])));
    const events: string[] = [];
    await streamGenerate({ projectId: "p", prompt: "x" }, (e) => events.push(e.type));
    expect(events).toEqual(["meta", "done"]);
  });

  it("没有收到 done 就结束时报连接中断，并带上请求 id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['data: {"type":"meta","mode":"mock","flow":"create"}\n\n'])));
    const err = await streamGenerate({ projectId: "p", prompt: "x" }, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(GenerateError);
    expect(err.code).toBe("STREAM_INTERRUPTED");
    expect(err.retryable).toBe(true);
    expect(err.requestId).toBe("req1");
  });

  it("把接口返回的错误码透传给调用方", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "RATE_LIMITED", message: "今日生成次数已达上限", retryable: false } }, { status: 429 }),
      ),
    );
    const err = await streamGenerate({ projectId: "p", prompt: "x" }, () => {}).catch((e) => e);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("上限");
  });

  it("网络失败时给出可重试的提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await streamGenerate({ projectId: "p", prompt: "x" }, () => {}).catch((e) => e);
    expect(err.code).toBe("NETWORK");
    expect(err.retryable).toBe(true);
  });
});
