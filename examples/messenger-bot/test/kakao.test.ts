import { afterEach, describe, expect, it, vi } from "vitest";
import { handleKakaoSkill, isKakaoCallbackUrl, KAKAO_CALLBACK_ACK, kakaoTextResponse } from "../src/kakao";
import { bodiesSentTo, makeCtx, makeEnv } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const kakaoRequest = (userRequest: Record<string, unknown>) =>
  new Request("https://bot.test/kakao/skill?key=test-kakao-secret", {
    method: "POST",
    body: JSON.stringify({ userRequest, bot: { id: "b1" }, action: { params: {} } }),
  });

function mockClaude(json: string, delayMs = 0) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("anthropic")) {
      await new Promise((r) => setTimeout(r, delayMs));
      return new Response(JSON.stringify({ content: [{ type: "text", text: json }] }));
    }
    if (url.includes("atlassian")) return new Response(JSON.stringify({ key: "BOM-9" }), { status: 201 });
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("kakaoTextResponse (카카오 답변 모양)", () => {
  it("스킬 응답 2.0 형식의 simpleText를 만든다", () => {
    expect(kakaoTextResponse("안녕하세요")).toEqual({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "안녕하세요" } }] },
    });
  });

  it("1000자를 넘으면 자른다", () => {
    const res = kakaoTextResponse("가".repeat(1500));
    expect(res.template.outputs[0]?.simpleText.text.length).toBeLessThanOrEqual(1000);
  });

  it("콜백 즉시 응답 모양", () => {
    expect(KAKAO_CALLBACK_ACK).toEqual({
      version: "2.0",
      useCallback: true,
      data: { text: "답변을 준비하고 있어요..." },
    });
  });
});

describe("handleKakaoSkill (카카오 스킬 처리)", () => {
  it("callbackUrl이 있으면 즉시 useCallback 응답 → 나중에 콜백 주소로 최종 답변", async () => {
    const fetchMock = mockClaude('{"answer":"10시에 열어요","category":"영업정보","needs_human":false}');
    const { ctx, settle } = makeCtx();
    const res = await handleKakaoSkill(
      kakaoRequest({ utterance: "몇 시에 열어요?", callbackUrl: "https://bot-api.kakao.com/abc" }),
      makeEnv(),
      ctx,
    );
    expect(await res.json()).toEqual(KAKAO_CALLBACK_ACK);
    await settle();
    expect(bodiesSentTo(fetchMock, "bot-api.kakao.com")).toEqual([kakaoTextResponse("10시에 열어요")]);
  });

  it("callbackUrl이 없으면 바로 답한다", async () => {
    mockClaude('{"answer":"예약금은 10,000원이에요","category":"예약","needs_human":false}');
    const res = await handleKakaoSkill(kakaoRequest({ utterance: "예약금 있어요?" }), makeEnv(), makeCtx().ctx);
    expect(await res.json()).toEqual(kakaoTextResponse("예약금은 10,000원이에요"));
  });

  it("Claude가 너무 느리면 시간 안에 안내 문구로 답한다", async () => {
    mockClaude('{"answer":"늦은 답","category":"기타","needs_human":false}', 200);
    const res = await handleKakaoSkill(kakaoRequest({ utterance: "질문" }), makeEnv(), makeCtx().ctx, {
      syncTimeoutMs: 20,
    });
    const body = (await res.json()) as ReturnType<typeof kakaoTextResponse>;
    expect(body.template.outputs[0]?.simpleText.text).toMatch(/잠시 후/);
  });

  it("환불 문의는 답한 뒤 Slack·Jira로 넘기고, 전화번호는 가린다", async () => {
    const fetchMock = mockClaude('{"answer":"담당자가 확인할게요","category":"환불","needs_human":true}');
    const { ctx, settle } = makeCtx();
    await handleKakaoSkill(kakaoRequest({ utterance: "환불해줘요 010-1234-5678" }), makeEnv(), ctx);
    await settle();
    const [jira] = bodiesSentTo(fetchMock, "atlassian");
    expect(JSON.stringify(jira)).toContain("[전화번호]");
    expect(JSON.stringify(jira)).not.toContain("1234-5678");
    expect(bodiesSentTo(fetchMock, "hooks.slack")).toHaveLength(1);
  });

  it("utterance가 없거나 JSON이 아니면 안내 문구로 답한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockClaude("{}");
    const res = await handleKakaoSkill(kakaoRequest({}), makeEnv(), makeCtx().ctx);
    const bad = await handleKakaoSkill(
      new Request("https://bot.test/kakao/skill?key=test-kakao-secret", { method: "POST", body: "oops" }),
      makeEnv(),
      makeCtx().ctx,
    );
    for (const r of [res, bad]) {
      const body = (await r.json()) as ReturnType<typeof kakaoTextResponse>;
      expect(body.version).toBe("2.0");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("콜백 전송이 실패해도 오류만 기록한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("anthropic")
          ? new Response(JSON.stringify({ content: [{ type: "text", text: '{"answer":"a","category":"기타","needs_human":false}' }] }))
          : new Response("expired", { status: 400 }),
      ),
    );
    const { ctx, settle } = makeCtx();
    await handleKakaoSkill(kakaoRequest({ utterance: "q", callbackUrl: "https://bot-api.kakao.com/x" }), makeEnv(), ctx);
    await settle();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("콜백"));
  });

  it("key가 없거나 틀리면 401 — Claude를 부르지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockClaude("{}");
    for (const url of ["https://bot.test/kakao/skill", "https://bot.test/kakao/skill?key=wrong"]) {
      const req = new Request(url, { method: "POST", body: JSON.stringify({ userRequest: { utterance: "hi" } }) });
      const res = await handleKakaoSkill(req, makeEnv(), makeCtx().ctx);
      expect(res.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("카카오 주소가 아닌 callbackUrl로는 답을 보내지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockClaude('{"answer":"a","category":"기타","needs_human":false}');
    const { ctx, settle } = makeCtx();
    await handleKakaoSkill(kakaoRequest({ utterance: "q", callbackUrl: "https://evil.example/steal" }), makeEnv(), ctx);
    await settle();
    expect(bodiesSentTo(fetchMock, "evil.example")).toHaveLength(0);
  });

  it("isKakaoCallbackUrl: https + kakao.com 만 허용", () => {
    expect(isKakaoCallbackUrl("https://bot-api.kakao.com/v1/x")).toBe(true);
    expect(isKakaoCallbackUrl("http://bot-api.kakao.com/x")).toBe(false);
    expect(isKakaoCallbackUrl("https://kakao.com.evil.example/x")).toBe(false);
    expect(isKakaoCallbackUrl("not a url")).toBe(false);
  });

  it("본문이 null이거나 utterance가 숫자여도 500 없이 안내 문구로 답한다", async () => {
    mockClaude("{}");
    for (const body of ["null", JSON.stringify({ userRequest: { utterance: 123 } })]) {
      const req = new Request("https://bot.test/kakao/skill?key=test-kakao-secret", { method: "POST", body });
      const res = await handleKakaoSkill(req, makeEnv(), makeCtx().ctx);
      expect(res.status).toBe(200);
    }
  });
});
