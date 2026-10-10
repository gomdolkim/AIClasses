// ─────────────────────────────────────────────────────────────
// claude.ts — Claude(AI)에게 질문하고 답을 받아 오는 부분
//
// 하는 일 3가지
//  1) 요청 만들기: "업무 매뉴얼(knowledge.ts) + 손님 질문"을 묶습니다.
//  2) 보내기: Anthropic API 주소로 전송합니다.
//  3) 답 읽기: {answer, category, needs_human} 모양인지 꼼꼼히 확인합니다.
//     모양이 이상하면 "담당자 연결" 기본 답변으로 안전하게 바꿉니다.
// ─────────────────────────────────────────────────────────────

import { SYSTEM_PROMPT } from "./knowledge";
import { errorMessage, logger } from "./logger";
import { CATEGORIES, type BotReply, type Category, type Env } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // 빠르고 저렴한 모델 (FAQ 응대에 충분)
const MAX_TOKENS = 1024; // 답변 최대 길이 (메신저 답장에는 넉넉함)
const TIMEOUT_MS = 25_000; // 25초 안에 답이 없으면 포기
const MAX_INPUT_CHARS = 1000; // 손님 글은 1000자까지만 Claude에 보냅니다. (비용 낭비·긴 악성 글 방지)

/** 무슨 일이 있어도 손님에게 보낼 수 있는 안전한 기본 답변 (한국어 + 일본어) */
export const FALLBACK_REPLY: BotReply = {
  answer:
    "죄송합니다. 지금 바로 답변드리기 어려워 담당자가 확인 후 연락드리겠습니다.\n" +
    "申し訳ございません。担当者が確認のうえ、ご連絡いたします。",
  category: "기타",
  needs_human: true,
};

/** Claude에게 "이 모양의 JSON으로만 답하라"고 알려 주는 설계도 (Structured Outputs) */
const REPLY_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    // 분류 6가지: "영업정보" | "예약" | "관리상담" | "환불" | "불만" | "기타" (types.ts의 CATEGORIES)
    category: { type: "string", enum: [...CATEGORIES] },
    needs_human: { type: "boolean" },
  },
  required: ["answer", "category", "needs_human"],
  additionalProperties: false,
} as const;

/** 1) 요청 만들기 — 손님 질문(이미 개인정보를 가린 글)을 받아 API 요청 본문을 만듭니다. */
export function buildClaudeRequest(maskedText: string) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // system = 업무 매뉴얼. cache_control은 "이 부분은 매번 같으니 기억해 두세요"라는 표시입니다.
    // (같은 글이 반복되면 더 싸고 빨라집니다. 단, Haiku 4.5는 약 4,096토큰 이상일 때만 캐시되므로
    //  FAQ가 짧은 지금은 효과가 없고, FAQ를 많이 늘렸을 때 자동으로 효과가 납니다. 오류는 나지 않아요)
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: maskedText.slice(0, MAX_INPUT_CHARS) }],
    // 답을 반드시 위 설계도(JSON) 모양으로 받도록 요청합니다.
    output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
  };
}

/** 글 속에서 { ... } 부분만 잘라 냅니다. (```json 같은 장식이 붙어 와도 괜찮도록) */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

/** 받은 데이터가 정말 BotReply 모양인지 한 칸씩 확인합니다. */
function isBotReply(value: unknown): value is BotReply {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.answer === "string" &&
    v.answer.trim().length > 0 &&
    CATEGORIES.includes(v.category as Category) &&
    typeof v.needs_human === "boolean"
  );
}

/** 3) 답 읽기 — 실패하면 항상 FALLBACK_REPLY(담당자 연결)를 돌려줍니다. */
export function parseBotReply(text: string): BotReply {
  const json = extractJson(text);
  if (json === null) return FALLBACK_REPLY;
  try {
    const data: unknown = JSON.parse(json);
    if (!isBotReply(data)) return FALLBACK_REPLY;
    return { answer: data.answer.trim(), category: data.category, needs_human: data.needs_human };
  } catch {
    return FALLBACK_REPLY;
  }
}

/** API 응답에서 글(text) 부분만 꺼냅니다. */
function firstText(data: unknown): string | null {
  const content = (data as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  const block = content.find((b) => b.type === "text" && typeof b.text === "string");
  return block?.text ?? null;
}

/** 2) 보내기 — Claude에게 묻고, 어떤 오류가 나도 BotReply를 돌려줍니다. */
export async function askClaude(env: Env, maskedText: string): Promise<BotReply> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildClaudeRequest(maskedText)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error("Claude API 오류", { status: res.status, body: (await res.text()).slice(0, 300) });
      return FALLBACK_REPLY;
    }
    const text = firstText(await res.json());
    if (text === null) {
      logger.error("Claude 응답에 글이 없음");
      return FALLBACK_REPLY;
    }
    return parseBotReply(text);
  } catch (err) {
    logger.error("Claude 호출 실패", { error: errorMessage(err) });
    return FALLBACK_REPLY;
  }
}
