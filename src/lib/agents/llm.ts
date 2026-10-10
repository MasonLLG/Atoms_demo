import OpenAI from "openai";
import { mockJson, mockStream } from "./mock";

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

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
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
        { signal },
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
        { signal },
      );
      let full = "";
      for await (const chunk of stream) {
        const t = chunk.choices[0]?.delta?.content;
        if (t) {
          full += t;
          onDelta(t);
        }
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
