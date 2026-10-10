// 테스트에서 공통으로 쓰는 도우미 (가짜 비밀값, 가짜 실행 환경)
import { vi } from "vitest";
import type { Env } from "../src/types";

/** 가짜 비밀값 9개. 일부만 바꾸고 싶으면 overrides에 넣습니다. */
export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    LINE_CHANNEL_SECRET: "test-line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "test-line-token",
    SLACK_WEBHOOK_URL: "https://hooks.slack.test/services/T/B/X",
    JIRA_BASE_URL: "https://bomnal.atlassian.test",
    JIRA_EMAIL: "owner@bomnal.test",
    JIRA_API_TOKEN: "test-jira-token",
    JIRA_PROJECT_KEY: "BOM",
    KAKAO_SKILL_SECRET: "test-kakao-secret",
    ...overrides,
  };
}

/** 가짜 ExecutionContext: waitUntil로 맡긴 작업을 모아 두었다가 settle()로 끝까지 기다립니다. */
export function makeCtx() {
  const tasks: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: vi.fn((p: Promise<unknown>) => {
      tasks.push(p);
    }),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
  const settle = () => Promise.all(tasks);
  return { ctx, settle };
}

/** HMAC-SHA256 서명을 base64로 만듭니다 (LINE이 하는 것과 같은 방식). */
export async function signLine(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return btoa(String.fromCharCode(...sig));
}

/** fetch 호출 기록에서 특정 주소로 보낸 요청 본문(JSON)들을 꺼냅니다. */
export function bodiesSentTo(fetchMock: ReturnType<typeof vi.fn>, urlPart: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes(urlPart))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
