import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askClaude,
  buildClaudeRequest,
  FALLBACK_REPLY,
  parseBotReply,
} from "../src/claude";
import { SYSTEM_PROMPT } from "../src/knowledge";
import { makeEnv } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseBotReply (Claude 답변 읽기)", () => {
  it("올바른 JSON을 읽는다", () => {
    const reply = parseBotReply('{"answer":"10시에 열어요","category":"영업정보","needs_human":false}');
    expect(reply).toEqual({ answer: "10시에 열어요", category: "영업정보", needs_human: false });
  });

  it("```json 코드 블록이나 앞뒤 설명이 붙어 있어도 읽는다", () => {
    const text = '네!\n```json\n{"answer":"OK","category":"배송","needs_human":false}\n```';
    expect(parseBotReply(text).category).toBe("배송");
  });

  it("JSON이 깨졌으면 안전한 기본 답변(needs_human=true)을 돌려준다", () => {
    expect(parseBotReply("죄송해요 {잘못된")).toEqual(FALLBACK_REPLY);
    expect(parseBotReply("")).toEqual(FALLBACK_REPLY);
  });

  it("칸이 빠졌거나 형식이 틀리면 기본 답변을 돌려준다", () => {
    expect(parseBotReply('{"answer":"hi","category":"영업정보"}')).toEqual(FALLBACK_REPLY);
    expect(parseBotReply('{"answer":"","category":"영업정보","needs_human":false}')).toEqual(FALLBACK_REPLY);
    expect(parseBotReply('{"answer":"hi","category":"없는분류","needs_human":false}')).toEqual(FALLBACK_REPLY);
    expect(parseBotReply('{"answer":"hi","category":"주문","needs_human":"no"}')).toEqual(FALLBACK_REPLY);
    expect(parseBotReply("[1,2]")).toEqual(FALLBACK_REPLY);
  });

  it("기본 답변은 한국어와 일본어를 모두 담고 있다", () => {
    expect(FALLBACK_REPLY.needs_human).toBe(true);
    expect(FALLBACK_REPLY.answer).toMatch(/담당자/);
    expect(FALLBACK_REPLY.answer).toMatch(/担当者/);
  });
});

describe("buildClaudeRequest (Claude에게 보낼 요청 만들기)", () => {
  it("Haiku 4.5 모델, 캐시 표시가 붙은 system, 손님 메시지를 담는다", () => {
    const body = buildClaudeRequest("영업시간 알려주세요");
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.system).toEqual([
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toEqual([{ role: "user", content: "영업시간 알려주세요" }]);
    expect(body.output_config.format.type).toBe("json_schema");
  });
});

describe("askClaude (Claude API 호출)", () => {
  const okResponse = (text: string) =>
    new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), {
      status: 200,
    });

  it("올바른 주소·헤더로 요청하고 답변을 읽어 온다", async () => {
    const fetchMock = vi.fn(async () =>
      okResponse('{"answer":"월요일은 쉬어요","category":"영업정보","needs_human":false}'),
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await askClaude(makeEnv(), "월요일에 열어요?");

    expect(reply.answer).toBe("월요일은 쉬어요");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-anthropic-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(String(init.body)).messages[0].content).toBe("월요일에 열어요?");
  });

  it("API가 오류(예: 401, 529)를 돌려주면 기본 답변을 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 529 })));
    expect(await askClaude(makeEnv(), "hi")).toEqual(FALLBACK_REPLY);
  });

  it("네트워크 오류가 나도 기본 답변을 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))));
    expect(await askClaude(makeEnv(), "hi")).toEqual(FALLBACK_REPLY);
  });

  it("응답에 글(text)이 없으면 기본 답변을 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [], stop_reason: "refusal" }))),
    );
    expect(await askClaude(makeEnv(), "hi")).toEqual(FALLBACK_REPLY);
  });
});
