// ─────────────────────────────────────────────────────────────
// kakao.ts — 카카오톡 채널 챗봇 스킬 처리 (부록 D)
//
// 카카오는 5초 안에 답하지 않으면 실패로 봅니다. 그래서 두 가지 방법이 있어요.
//  A) 콜백 켬(callbackUrl 있음): "답변 준비 중"이라고 즉시 답하고,
//     뒤에서 Claude 답을 받아 callbackUrl로 보내 줍니다. (5분 안에, 1회만)
//  B) 콜백 끔: 4초 안에 Claude 답이 오면 그대로, 늦으면 안내 문구로 답합니다.
// ─────────────────────────────────────────────────────────────

import { askClaude } from "./claude";
import { escalateIfNeeded } from "./escalate";
import { errorMessage, logger } from "./logger";
import { maskPersonalInfo } from "./privacy";
import { OUTBOUND_TIMEOUT_MS, timingSafeEqual } from "./security";
import type { BotReply, Env, KakaoSkillRequest } from "./types";

const KAKAO_TEXT_LIMIT = 1000; // simpleText 최대 글자 수
const DEFAULT_SYNC_TIMEOUT_MS = 4000; // 카카오 제한 5초보다 여유 있게 4초

const SLOW_MESSAGE = "질문이 접수되었어요. 잠시 후 다시 물어봐 주시면 답변드릴게요. 🌷";
const EMPTY_MESSAGE = "궁금한 점을 글로 보내 주세요. 🌷";

/** 콜백을 쓸 때 즉시 돌려주는 응답 */
export const KAKAO_CALLBACK_ACK = {
  version: "2.0",
  useCallback: true,
  data: { text: "답변을 준비하고 있어요..." },
} as const;

/** 카카오 스킬 응답(2.0) 모양으로 글을 감쌉니다. */
export function kakaoTextResponse(text: string) {
  return {
    version: "2.0",
    template: { outputs: [{ simpleText: { text: text.slice(0, KAKAO_TEXT_LIMIT) } }] },
  };
}

/** JSON 응답 만들기 */
function json(data: unknown): Response {
  return Response.json(data);
}

/**
 * 카카오 스킬에는 LINE 같은 서명이 없습니다. 그래서 스킬 URL 뒤에 비밀값을 붙여 두고
 * (예: /kakao/skill?key=긴-무작위-글자) 맞는 요청만 받습니다. 모르는 사람의 요청을 막아
 * Claude 비용 낭비와 직원 알림 도배를 막는 "최소한의 문"입니다.
 */
export function isKakaoAuthorized(request: Request, secret: string): boolean {
  const key = new URL(request.url).searchParams.get("key");
  return key !== null && timingSafeEqual(key, secret);
}

/** 콜백 주소가 카카오 것(https + kakao.com)인지 확인합니다. 아무 주소로나 답을 보내지 않기 위해서입니다. */
export function isKakaoCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "kakao.com" || url.hostname.endsWith(".kakao.com"));
  } catch {
    return false;
  }
}

/** 요청 본문을 읽습니다. 깨진 요청이면 빈 객체. */
async function readBody(request: Request): Promise<KakaoSkillRequest> {
  try {
    const data: unknown = await request.json();
    return typeof data === "object" && data !== null ? (data as KakaoSkillRequest) : {};
  } catch {
    logger.error("카카오 요청 본문이 JSON이 아님");
    return {};
  }
}

/** 정해진 시간 안에 끝나지 않으면 null을 돌려줍니다. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([promise, timer]);
}

/** A) 콜백: Claude 답을 callbackUrl로 보내고, 필요하면 직원에게 넘깁니다. */
async function answerByCallback(env: Env, callbackUrl: string, maskedText: string): Promise<void> {
  const reply = await askClaude(env, maskedText);
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kakaoTextResponse(reply.answer)),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (!res.ok) logger.error("카카오 콜백 전송 실패", { status: res.status });
  } catch (err) {
    logger.error("카카오 콜백 전송 실패", { error: errorMessage(err) });
  }
  await escalateIfNeeded(env, { channel: "카카오", maskedText, reply });
}

/** B) 바로 답하기: 시간 안에 오면 답, 늦으면 안내 문구. 직원 연결은 뒤에서 처리합니다. */
async function answerNow(
  env: Env,
  ctx: ExecutionContext,
  maskedText: string,
  timeoutMs: number,
): Promise<Response> {
  const pending = askClaude(env, maskedText);
  // 늦게 도착한 답이라도 직원 연결이 필요하면 처리되도록 뒤에 맡겨 둡니다.
  ctx.waitUntil(
    pending.then((reply: BotReply) => escalateIfNeeded(env, { channel: "카카오", maskedText, reply })),
  );
  const reply = await withTimeout(pending, timeoutMs);
  return json(kakaoTextResponse(reply ? reply.answer : SLOW_MESSAGE));
}

/** 입구: POST /kakao/skill */
export async function handleKakaoSkill(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options: { syncTimeoutMs?: number } = {},
): Promise<Response> {
  if (!isKakaoAuthorized(request, env.KAKAO_SKILL_SECRET)) {
    logger.error("카카오 요청 거절 — key가 없거나 틀림");
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await readBody(request);
  const rawUtterance = body.userRequest?.utterance;
  const utterance = typeof rawUtterance === "string" ? rawUtterance.trim() : "";
  if (!utterance) return json(kakaoTextResponse(EMPTY_MESSAGE));

  const maskedText = maskPersonalInfo(utterance);
  const callbackUrl = body.userRequest?.callbackUrl;
  if (typeof callbackUrl === "string" && callbackUrl) {
    if (!isKakaoCallbackUrl(callbackUrl)) {
      logger.error("카카오 callbackUrl이 카카오 주소가 아님 — 무시");
      return answerNow(env, ctx, maskedText, options.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS);
    }
    ctx.waitUntil(answerByCallback(env, callbackUrl, maskedText));
    return json(KAKAO_CALLBACK_ACK);
  }
  return answerNow(env, ctx, maskedText, options.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS);
}
