import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { describe, expect, it } from "vitest";
import { AppError, toAppError, toPublicError } from "../../src/lib/errors";

const apiError = (status: number) => APIError.generate(status, { error: { message: "upstream" } }, "upstream", new Headers());

describe("toAppError", () => {
  it.each([
    [401, "LLM_AUTH", false],
    [402, "LLM_QUOTA", false],
    [429, "LLM_BUSY", true],
    [500, "LLM_UNAVAILABLE", true],
    [503, "LLM_UNAVAILABLE", true],
  ])("上游 %i 映射为 %s", (status, code, retryable) => {
    const e = toAppError(apiError(status));
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
  });

  it("识别超时、连接失败与用户取消", () => {
    expect(toAppError(new APIConnectionTimeoutError()).code).toBe("LLM_TIMEOUT");
    expect(toAppError(new APIConnectionError({ message: "x" })).code).toBe("LLM_UNAVAILABLE");
    expect(toAppError(new APIUserAbortError()).code).toBe("CANCELLED");
    expect(toAppError(Object.assign(new Error("x"), { name: "AbortError" })).code).toBe("CANCELLED");
  });

  it("AppError 原样返回，未知错误归为 INTERNAL 且不泄露原始信息", () => {
    const e = new AppError("DB_ERROR");
    expect(toAppError(e)).toBe(e);
    const pub = toPublicError(new Error("password=secret"));
    expect(pub.code).toBe("INTERNAL");
    expect(pub.message).not.toContain("secret");
  });
});
