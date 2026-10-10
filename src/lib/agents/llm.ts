import OpenAI from "openai";
import { AppError } from "../errors";
import { mockJson, mockStream } from "./mock";

const JSON_TIMEOUT_MS = 60_000;
const STREAM_CONNECT_TIMEOUT_MS = 60_000;
const STREAM_IDLE_TIMEOUT_MS = 45_000;

export interface LLM {
  readonly mode: "live" | "mock";
  /** JSON 模式调用，返回原始字符串，由调用方用 zod 校验 */
  json(system: string, user: string, signal?: AbortSignal): Promise<string>;
  /** 流式文本调用，每个增量回调一次，返回完整文本 */
  stream(system: string, user: string, onDelta: (t: string) => void, signal?: AbortSignal): Promise<string>;
}

// DeepSeek 兼容 OpenAI 协议；换成其它兼容服务只需改环境变量
export function getLLM(): LLM {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey || process.env.LLM_MOCK === "1") return mockLLM;

  // SDK 内置指数退避重试：连接错误、408、409、429、5xx 会自动重试（流式请求只重试建立连接阶段）
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
    maxRetries: 2,
  });
  const model = process.env.LLM_MODEL || "deepseek-chat";

  return {
    mode: "live",
    async json(system, user, signal) {
      const res = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 2048,
        },
        { signal, timeout: JSON_TIMEOUT_MS },
      );
      return res.choices[0]?.message?.content ?? "";
    },
    async stream(system, user, onDelta, signal) {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: true,
          temperature: 0.4,
          max_tokens: 8192,
        },
        { signal, timeout: STREAM_CONNECT_TIMEOUT_MS },
      );
      // 空闲看门狗：连续一段时间没有新 token 就中止，避免请求挂死到平台超时
      let idle: ReturnType<typeof setTimeout> | undefined;
      let stalled = false;
      const arm = () => {
        clearTimeout(idle);
        idle = setTimeout(() => {
          stalled = true;
          stream.controller.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      let full = "";
      try {
        arm();
        for await (const chunk of stream) {
          arm();
          const t = chunk.choices[0]?.delta?.content;
          if (t) {
            full += t;
            onDelta(t);
          }
        }
      } catch (e) {
        if (stalled) throw new AppError("LLM_TIMEOUT", "模型长时间没有输出，已中止，请重试", { cause: e });
        throw e;
      } finally {
        clearTimeout(idle);
      }
      return full;
    },
  };
}

const mockLLM: LLM = {
  mode: "mock",
  json: async (system, user) => mockJson(system, user),
  stream: async (system, user, onDelta) => mockStream(system, user, onDelta),
};
