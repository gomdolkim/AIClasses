// ─────────────────────────────────────────────────────────────
// line.ts — LINE 공식계정에서 온 메시지 처리
//
// 흐름
//  1) 서명 확인: 정말 LINE이 보낸 요청인지 "도장"을 확인합니다. (가짜 요청 차단)
//  2) LINE에 즉시 "받았어요(200)"라고 응답합니다. (늦으면 LINE이 실패로 판단)
//  3) 뒤에서(waitUntil) 천천히 처리합니다:
//     로딩 표시 → 개인정보 가리기 → Claude에게 질문 → 답장 → 필요하면 직원에게 넘기기
// ─────────────────────────────────────────────────────────────

import { askClaude } from "./claude";
import { escalateIfNeeded } from "./escalate";
import { errorMessage, logger } from "./logger";
import { maskPersonalInfo } from "./privacy";
import { OUTBOUND_TIMEOUT_MS, timingSafeEqual } from "./security";
import type { Env, LineEvent, LineWebhookBody } from "./types";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_TEXT_LIMIT = 5000; // LINE 텍스트 메시지 최대 글자 수
const MAX_BODY_BYTES = 1_000_000; // 웹훅 본문 최대 크기 (1MB). 정상 요청은 훨씬 작습니다.
const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5분보다 오래된 이벤트는 다시 보낸 것(재전송·재사용)으로 보고 무시

/** 친구 추가 인사: AI 상담원임을 먼저 밝힙니다. (AI 기본법 고지 권장 사항) */
const GREETING =
  "안녕하세요, 봄날의 꽃 AI 상담원입니다. 영업시간·가격·배송 등 궁금한 점을 글로 보내 주세요. 🌷\n" +
  "こんにちは、春の日の花(봄날의 꽃)のAI相談員です。営業時間・価格・配送など、お気軽にメッセージでどうぞ。";

/** 스티커·사진 등 글자가 아닌 메시지에 보내는 안내 */
const NOT_TEXT_REPLY =
  "죄송해요, 지금은 글자 메시지만 읽을 수 있어요. 궁금한 점을 글로 보내 주세요.\n" +
  "申し訳ありません、現在は文字のメッセージのみ対応しています。";

// ── 1) 서명 확인 ────────────────────────────────────────────

/** 바이트 묶음을 base64 글자로 바꿉니다. */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * LINE 서명 확인: 본문을 채널 시크릿으로 HMAC-SHA256 계산 → base64 → 헤더 값과 비교
 * (LINE 공식 문서의 방법과 같습니다)
 */
export async function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  return timingSafeEqual(toBase64(new Uint8Array(mac)), signature);
}

// ── LINE API 호출 도우미 ────────────────────────────────────

/** LINE Messaging API에 POST 요청을 보냅니다. 실패해도 오류만 기록합니다. */
async function callLine(env: Env, path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error("LINE API 오류", { path, status: res.status, body: (await res.text()).slice(0, 300) });
    }
  } catch (err) {
    logger.error("LINE API 호출 실패", { path, error: errorMessage(err) });
  }
}

/** 답장 보내기 (replyToken은 1회용, 메시지를 받은 뒤 1분 안에 써야 합니다) */
function replyText(env: Env, replyToken: string, text: string): Promise<void> {
  const messages = [{ type: "text", text: text.slice(0, LINE_TEXT_LIMIT) }];
  return callLine(env, "/message/reply", { replyToken, messages });
}

/** "입력 중..." 로딩 표시 (1:1 대화에서만 동작, 최대 20초 동안 보임) */
function showLoading(env: Env, userId: string): Promise<void> {
  return callLine(env, "/chat/loading/start", { chatId: userId, loadingSeconds: 20 });
}

// ── 3) 이벤트(메시지) 하나 처리하기 ───────────────────────────

/** 손님의 글자 메시지 처리: 로딩 → 가리기 → Claude → 답장 → (필요시) 직원 연결 */
async function handleTextMessage(env: Env, replyToken: string, event: LineEvent): Promise<void> {
  const userId = event.source?.userId;
  if (userId) await showLoading(env, userId);

  const maskedText = maskPersonalInfo(event.message?.text ?? "");
  const reply = await askClaude(env, maskedText);
  await replyText(env, replyToken, reply.answer);
  await escalateIfNeeded(env, { channel: "LINE", maskedText, reply });
}

/** 너무 오래된 이벤트인지 확인합니다. (서명은 시간이 없어서, 가로챈 요청을 나중에 다시 보내는 것을 막습니다) */
export function isStaleEvent(event: LineEvent, now: number = Date.now()): boolean {
  return typeof event.timestamp === "number" && now - event.timestamp > MAX_EVENT_AGE_MS;
}

/** 이벤트 종류에 따라 알맞은 처리를 고릅니다. */
async function handleEvent(env: Env, event: LineEvent): Promise<void> {
  const token = event.replyToken;
  if (!token) return; // 답장할 수 없는 이벤트(친구 차단 등)는 무시
  if (isStaleEvent(event)) {
    logger.error("오래된 LINE 이벤트 무시", { type: event.type });
    return;
  }
  if (event.type === "follow") return replyText(env, token, GREETING);
  if (event.type !== "message") return; // 그 밖의 이벤트는 무시
  if (event.message?.type === "text") return handleTextMessage(env, token, event);
  return replyText(env, token, NOT_TEXT_REPLY); // 스티커·사진·음성 등
}

/** 이벤트 하나가 실패해도 다른 이벤트 처리에 영향이 없도록 감쌉니다. */
async function safeHandleEvent(env: Env, event: LineEvent): Promise<void> {
  try {
    await handleEvent(env, event);
  } catch (err) {
    logger.error("LINE 이벤트 처리 실패", { type: event.type, error: errorMessage(err) });
  }
}

// ── 입구: POST /line/webhook ────────────────────────────────

/** LINE 웹훅 요청 처리. 서명 확인 후 바로 200을 돌려주고, 나머지는 뒤에서 처리합니다. */
export async function handleLineWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // 너무 큰 요청은 읽기 전에 거절합니다. (LINE이 보내는 요청은 훨씬 작습니다)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  const rawBody = await request.text(); // 서명 확인은 "원본 글 그대로"로 해야 합니다.
  const signature = request.headers.get("x-line-signature");
  if (!(await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
    logger.error("LINE 서명 불일치 — 가짜 요청이거나 채널 시크릿이 틀림");
    return new Response("Invalid signature", { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    logger.error("LINE 요청 본문이 JSON이 아님");
    return new Response("Bad request", { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  ctx.waitUntil(Promise.all(events.map((event) => safeHandleEvent(env, event))));
  return new Response("OK", { status: 200 });
}
