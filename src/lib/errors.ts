import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";

/**
 * 统一错误码：服务端抛出 AppError，接口与 SSE 只把 code / message / retryable 交给前端，
 * 原始错误只进日志，避免把上游细节或密钥相关信息暴露给用户。
 */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFIG_MISSING"
  | "LLM_AUTH"
  | "LLM_QUOTA"
  | "LLM_BUSY"
  | "LLM_UNAVAILABLE"
  | "LLM_TIMEOUT"
  | "LLM_BAD_OUTPUT"
  | "DB_ERROR"
  | "CANCELLED"
  | "INTERNAL";

const DEFAULTS: Record<ErrorCode, { message: string; status: number; retryable: boolean }> = {
  UNAUTHORIZED: { message: "请先登录", status: 401, retryable: false },
  BAD_REQUEST: { message: "请求参数不正确", status: 400, retryable: false },
  NOT_FOUND: { message: "项目不存在或无权访问", status: 404, retryable: false },
  RATE_LIMITED: { message: "今日生成次数已达上限", status: 429, retryable: false },
  CONFIG_MISSING: { message: "服务端配置缺失，请联系管理员", status: 500, retryable: false },
  LLM_AUTH: { message: "模型服务鉴权失败，请检查 API Key 配置", status: 502, retryable: false },
  LLM_QUOTA: { message: "模型服务余额不足，请联系管理员充值", status: 502, retryable: false },
  LLM_BUSY: { message: "模型服务繁忙，请稍后重试", status: 503, retryable: true },
  LLM_UNAVAILABLE: { message: "模型服务暂时不可用，请稍后重试", status: 503, retryable: true },
  LLM_TIMEOUT: { message: "模型响应超时，请重试；需求较复杂时可以拆成几步来做", status: 504, retryable: true },
  LLM_BAD_OUTPUT: { message: "模型输出格式不符合要求，请重试", status: 502, retryable: true },
  DB_ERROR: { message: "数据保存失败，请重试", status: 500, retryable: true },
  CANCELLED: { message: "已停止生成", status: 499, retryable: true },
  INTERNAL: { message: "服务出现未知错误，请重试", status: 500, retryable: true },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? DEFAULTS[code].message, options);
    this.name = "AppError";
    this.code = code;
    this.status = DEFAULTS[code].status;
    this.retryable = DEFAULTS[code].retryable;
  }
}

export interface PublicError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

/** 把任意错误归类为 AppError：识别 OpenAI 兼容 SDK 的各类异常 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof APIUserAbortError || (err instanceof Error && err.name === "AbortError")) {
    return new AppError("CANCELLED", undefined, { cause: err });
  }
  if (err instanceof APIConnectionTimeoutError) return new AppError("LLM_TIMEOUT", undefined, { cause: err });
  if (err instanceof APIConnectionError) return new AppError("LLM_UNAVAILABLE", undefined, { cause: err });
  if (err instanceof APIError) {
    const s = err.status ?? 0;
    if (s === 401 || s === 403) return new AppError("LLM_AUTH", undefined, { cause: err });
    if (s === 402) return new AppError("LLM_QUOTA", undefined, { cause: err });
    if (s === 429) return new AppError("LLM_BUSY", undefined, { cause: err });
    if (s >= 500) return new AppError("LLM_UNAVAILABLE", undefined, { cause: err });
    return new AppError("INTERNAL", undefined, { cause: err });
  }
  return new AppError("INTERNAL", undefined, { cause: err });
}

export function toPublicError(err: unknown): PublicError {
  const e = toAppError(err);
  return { code: e.code, message: e.message, retryable: e.retryable };
}

/** 结构化日志：一行一个 JSON，便于在 Vercel Logs 中检索 */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** 记录错误时附带原始原因（上游状态码、消息），但不打印请求体 */
export function describeCause(err: unknown) {
  const e = err instanceof AppError ? err.cause : err;
  if (e instanceof APIError) return { upstreamStatus: e.status, upstreamMessage: e.message };
  if (e instanceof Error) return { cause: e.message };
  return {};
}
