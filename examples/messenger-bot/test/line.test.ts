import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLineWebhook, verifyLineSignature } from "../src/line";
import type { LineEvent } from "../src/types";
import { bodiesSentTo, makeCtx, makeEnv, signLine } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SECRET = "test-line-secret";

describe("verifyLineSignature (LINE 서명 확인)", () => {
  it("올바른 서명이면 true", async () => {
    const body = '{"events":[]}';
    expect(await verifyLineSignature(body, await signLine(body, SECRET), SECRET)).toBe(true);
  });

  it("본문이 바뀌었거나 비밀키가 다르면 false", async () => {
    const sig = await signLine('{"events":[]}', SECRET);
    expect(await verifyLineSignature('{"events":[1]}', sig, SECRET)).toBe(false);
    expect(await verifyLineSignature('{"events":[]}', sig, "other-secret")).toBe(false);
  });

  it("서명이 없거나 길이가 다르면 false", async () => {
    expect(await verifyLineSignature("{}", null, SECRET)).toBe(false);
    expect(await verifyLineSignature("{}", "abc", SECRET)).toBe(false);
  });
});

/** LINE이 보내는 것과 같은 모양의 요청을 만듭니다. */
async function lineRequest(events: LineEvent[], secret = SECRET): Promise<Request> {
  const body = JSON.stringify({ destination: "U0", events });
  return new Request("https://bot.test/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": await signLine(body, secret) },
    body,
  });
}

const textEvent = (text: string): LineEvent => ({
  type: "message",
  replyToken: "reply-token-1",
  source: { type: "user", userId: "U123" },
  message: { type: "text", text },
});

/** 주소별로 다른 가짜 응답을 돌려주는 fetch */
function mockFetch(claudeJson: string) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("anthropic")) {
      return new Response(JSON.stringify({ content: [{ type: "text", text: claudeJson }] }));
    }
    if (url.includes("atlassian")) return new Response(JSON.stringify({ key: "BOM-3" }), { status: 201 });
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("handleLineWebhook (LINE 메시지 처리)", () => {
  it("서명이 틀리면 401을 돌려주고 아무것도 하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockFetch("{}");
    const { ctx } = makeCtx();
    const res = await handleLineWebhook(await lineRequest([textEvent("hi")], "wrong"), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("텍스트 질문: 바로 200 → 로딩 표시 → 가린 글로 Claude 질문 → 답장", async () => {
    const fetchMock = mockFetch('{"answer":"10時から営業です","category":"영업정보","needs_human":false}');
    const { ctx, settle } = makeCtx();

    const res = await handleLineWebhook(
      await lineRequest([textEvent("営業時間は？ 090-1234-5678")]),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    await settle();

    expect(bodiesSentTo(fetchMock, "loading/start")).toEqual([{ chatId: "U123", loadingSeconds: 20 }]);
    const [claude] = bodiesSentTo(fetchMock, "anthropic") as Array<{ messages: Array<{ content: string }> }>;
    expect(claude?.messages[0]?.content).toBe("営業時間は？ [전화번호]");
    expect(bodiesSentTo(fetchMock, "message/reply")).toEqual([
      { replyToken: "reply-token-1", messages: [{ type: "text", text: "10時から営業です" }] },
    ]);
    expect(bodiesSentTo(fetchMock, "atlassian")).toHaveLength(0);
    const replyCall = fetchMock.mock.calls.find(([u]) => u.includes("message/reply")) as unknown as [string, RequestInit];
    const headers = replyCall[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-line-token");
  });

  it("불만이면 답장 후 Slack·Jira로 넘긴다", async () => {
    const fetchMock = mockFetch('{"answer":"죄송합니다. 담당자가 연락드릴게요","category":"불만","needs_human":true}');
    const { ctx, settle } = makeCtx();
    await handleLineWebhook(await lineRequest([textEvent("꽃이 다 시들었어요")]), makeEnv(), ctx);
    await settle();

    expect(bodiesSentTo(fetchMock, "message/reply")).toHaveLength(1);
    expect(bodiesSentTo(fetchMock, "atlassian")).toHaveLength(1);
    expect(bodiesSentTo(fetchMock, "hooks.slack")).toHaveLength(1);
  });

  it("스티커·사진에는 정중한 안내 답장만 하고 Claude는 부르지 않는다", async () => {
    const fetchMock = mockFetch("{}");
    const { ctx, settle } = makeCtx();
    const sticker: LineEvent = { ...textEvent(""), message: { type: "sticker" } };
    await handleLineWebhook(await lineRequest([sticker]), makeEnv(), ctx);
    await settle();

    expect(bodiesSentTo(fetchMock, "anthropic")).toHaveLength(0);
    const [reply] = bodiesSentTo(fetchMock, "message/reply") as Array<{ messages: Array<{ text: string }> }>;
    expect(reply?.messages[0]?.text).toMatch(/글자/);
  });

  it("친구 추가(follow)에는 AI 상담원임을 밝히는 인사를 보낸다", async () => {
    const fetchMock = mockFetch("{}");
    const { ctx, settle } = makeCtx();
    const follow: LineEvent = { type: "follow", replyToken: "rt-follow", source: { type: "user", userId: "U1" } };
    await handleLineWebhook(await lineRequest([follow]), makeEnv(), ctx);
    await settle();

    const [reply] = bodiesSentTo(fetchMock, "message/reply") as Array<{ messages: Array<{ text: string }> }>;
    expect(reply?.messages[0]?.text).toMatch(/AI/);
  });

  it("답장 토큰이 없는 이벤트(예: unfollow)와 빈 이벤트 목록(웹훅 검증)은 조용히 넘어간다", async () => {
    const fetchMock = mockFetch("{}");
    const { ctx, settle } = makeCtx();
    const res = await handleLineWebhook(await lineRequest([{ type: "unfollow" }]), makeEnv(), ctx);
    const res2 = await handleLineWebhook(await lineRequest([]), makeEnv(), makeCtx().ctx);
    await settle();
    expect(res.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("LINE 답장 API가 실패해도 오류만 기록하고 멈추지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("anthropic")
          ? new Response(JSON.stringify({ content: [{ type: "text", text: '{"answer":"a","category":"기타","needs_human":false}' }] }))
          : new Response("Invalid reply token", { status: 400 }),
      ),
    );
    const { ctx, settle } = makeCtx();
    const res = await handleLineWebhook(await lineRequest([textEvent("hi")]), makeEnv(), ctx);
    await settle();
    expect(res.status).toBe(200);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("LINE"));
  });

  it("본문이 JSON이 아니면 400", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = "not json";
    const req = new Request("https://bot.test/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": await signLine(body, SECRET) },
      body,
    });
    const res = await handleLineWebhook(req, makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(400);
  });

  it("5분보다 오래된 이벤트(재사용된 요청)는 무시한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockFetch('{"answer":"a","category":"기타","needs_human":false}');
    const { ctx, settle } = makeCtx();
    const old = { ...textEvent("안녕"), timestamp: Date.now() - 10 * 60 * 1000 };
    const res = await handleLineWebhook(await lineRequest([old]), makeEnv(), ctx);
    expect(res.status).toBe(200);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("너무 큰 요청은 413으로 거절한다", async () => {
    const fetchMock = mockFetch("{}");
    const req = new Request("https://bot.test/line/webhook", {
      method: "POST",
      headers: { "content-length": "5000000", "x-line-signature": "x" },
      body: "{}",
    });
    const res = await handleLineWebhook(req, makeEnv(), makeCtx().ctx);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
