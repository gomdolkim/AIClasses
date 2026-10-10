import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { missingEnv } from "../src/index";
import { makeCtx, makeEnv, signLine } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("missingEnv (비밀값 확인)", () => {
  it("비어 있거나 없는 비밀값 이름을 알려 준다", () => {
    expect(missingEnv(makeEnv(), ["ANTHROPIC_API_KEY"])).toEqual([]);
    expect(missingEnv(makeEnv({ ANTHROPIC_API_KEY: " " }), ["ANTHROPIC_API_KEY", "JIRA_EMAIL"])).toEqual([
      "ANTHROPIC_API_KEY",
    ]);
  });
});

describe("라우터 (주소별 길 안내)", () => {
  it("GET / 는 작동 확인 글을 보여 준다", async () => {
    const res = await worker.fetch(new Request("https://bot.test/"), makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("봄날 에스테틱");
  });

  it("모르는 주소는 404", async () => {
    const res = await worker.fetch(new Request("https://bot.test/nope"), makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(404);
  });

  it("GET /line/webhook 처럼 방법이 틀리면 404", async () => {
    const res = await worker.fetch(new Request("https://bot.test/line/webhook"), makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(404);
  });

  it("POST /line/webhook 은 LINE 처리로 연결된다", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const body = '{"events":[]}';
    const req = new Request("https://bot.test/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": await signLine(body, "test-line-secret") },
      body,
    });
    const res = await worker.fetch(req, makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(200);
  });

  it("POST /kakao/skill 은 카카오 처리로 연결된다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("https://bot.test/kakao/skill?key=test-kakao-secret", { method: "POST", body: "{}" });
    const res = await worker.fetch(req, makeEnv(), makeCtx().ctx);
    expect(((await res.json()) as { version: string }).version).toBe("2.0");
  });

  it("LINE 필수 비밀값이 없으면 500과 함께 어떤 값이 없는지 기록한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("https://bot.test/line/webhook", { method: "POST", body: "{}" });
    const res = await worker.fetch(req, makeEnv({ LINE_CHANNEL_SECRET: "" }), makeCtx().ctx);
    expect(res.status).toBe(500);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("LINE_CHANNEL_SECRET"));
  });

  it("카카오도 ANTHROPIC_API_KEY가 없으면 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("https://bot.test/kakao/skill?key=test-kakao-secret", { method: "POST", body: "{}" });
    const res = await worker.fetch(req, makeEnv({ ANTHROPIC_API_KEY: "" }), makeCtx().ctx);
    expect(res.status).toBe(500);
  });
});
