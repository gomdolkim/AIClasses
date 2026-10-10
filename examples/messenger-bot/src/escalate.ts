// ─────────────────────────────────────────────────────────────
// escalate.ts — 사람(직원)에게 넘기기
//
// 봇이 혼자 처리하면 안 되는 문의(환불·불만·관리 후 트러블·FAQ에 없는 질문)는
//  1) Jira "봄날 에스테틱 운영"(BOM) 프로젝트에 이슈(할 일 카드)를 만들고
//  2) Slack #cs-escalation 채널에 알림을 보냅니다.
// 여기서 실패해도 손님 답장에는 영향이 없도록, 오류는 기록만 하고 넘어갑니다.
// ─────────────────────────────────────────────────────────────

import { errorMessage, logger } from "./logger";
import { OUTBOUND_TIMEOUT_MS } from "./security";
import { missingEnv, type BotReply, type Category, type EscalationInfo, type Env } from "./types";

/** 이 분류는 무조건 사람이 처리합니다. */
const ALWAYS_HUMAN: readonly Category[] = ["환불", "불만"];

/** 사람에게 넘길지 결정: needs_human이 true이거나, 환불·불만이면 넘깁니다. */
export function shouldEscalate(reply: BotReply): boolean {
  return reply.needs_human || ALWAYS_HUMAN.includes(reply.category);
}

/** Jira 이슈 유형 (프로젝트에 이 3가지 유형을 미리 만들어 두세요) */
export type JiraIssueType = "예약" | "문의" | "클레임";

/** Jira 이슈 유형: 환불·불만 → "클레임", 예약 → "예약", 그 외 → "문의" */
export function jiraIssueType(category: Category): JiraIssueType {
  if (ALWAYS_HUMAN.includes(category)) return "클레임";
  return category === "예약" ? "예약" : "문의";
}

/**
 * Slack에서 특별한 뜻을 갖는 글자(& < >)를 안전한 글자로 바꿉니다. (Slack 공식 방법)
 * 손님이 <!channel> 이나 <@U123> 을 보내도 전체 호출·멘션이 되지 않고 그냥 글자로 보입니다.
 */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 알림에 넣을 글의 최대 길이 (너무 긴 글이 알림을 도배하지 않도록) */
const SLACK_FIELD_LIMIT = 500;

/** Slack 알림 글 만들기 */
export function buildSlackPayload(
  info: EscalationInfo,
  jiraKey: string | null,
): { text: string; mrkdwn: false } {
  const jiraLine = jiraKey ? `Jira: ${jiraKey}` : "Jira 이슈 생성 실패 — 직접 만들어 주세요";
  const text = [
    `🚨 [봄날 에스테틱 · 담당자 확인 필요] ${info.channel} 고객 문의`,
    `• 분류: ${info.reply.category}`,
    `• 고객 메시지(개인정보 가림): ${escapeSlack(info.maskedText.slice(0, SLACK_FIELD_LIMIT))}`,
    `• 봇이 보낸 답변: ${escapeSlack(info.reply.answer.slice(0, SLACK_FIELD_LIMIT))}`,
    `• ${jiraLine}`,
  ].join("\n");
  return { text, mrkdwn: false }; // mrkdwn: false → *굵게*, 링크 같은 서식도 끕니다.
}

/** Jira 이슈 내용 만들기. 설명(description)은 Jira 전용 문서 형식(ADF)으로 씁니다. */
export function buildJiraPayload(projectKey: string, info: EscalationInfo) {
  // Jira 제목에는 줄바꿈이 들어가면 안 됩니다. (들어가면 이슈 생성이 거절됨) 공백으로 바꿔 한 줄로 만듭니다.
  const oneLine = info.maskedText.replace(/\s+/g, " ").trim();
  const summary = `[${info.channel}/${info.reply.category}] ${oneLine}`.slice(0, 255);
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: jiraIssueType(info.reply.category) },
      summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          paragraph(`채널: ${info.channel}`),
          paragraph(`분류: ${info.reply.category}`),
          paragraph(`손님 메시지(개인정보 가림): ${info.maskedText}`),
          paragraph(`봇이 보낸 답변: ${info.reply.answer}`),
        ],
      },
    },
  };
}

/** Jira 이슈를 만들고 이슈 키(예: BOM-12)를 돌려줍니다. 실패하면 null. */
async function createJiraIssue(env: Env, info: EscalationInfo): Promise<string | null> {
  const lacks = missingEnv(env, ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"]);
  if (lacks.length > 0) {
    logger.error(`Jira 비밀값 없음: ${lacks.join(", ")}`);
    return null;
  }
  try {
    const url = `${env.JIRA_BASE_URL.replace(/\/+$/, "")}/rest/api/3/issue`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildJiraPayload(env.JIRA_PROJECT_KEY, info)),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error("Jira 이슈 생성 실패", { status: res.status, body: (await res.text()).slice(0, 300) });
      return null;
    }
    return ((await res.json()) as { key?: string }).key ?? null;
  } catch (err) {
    logger.error("Jira 이슈 생성 실패", { error: errorMessage(err) });
    return null;
  }
}

/** Slack 채널에 알림을 보냅니다. */
async function notifySlack(env: Env, info: EscalationInfo, jiraKey: string | null): Promise<void> {
  if (missingEnv(env, ["SLACK_WEBHOOK_URL"]).length > 0) {
    logger.error("Slack 비밀값 없음: SLACK_WEBHOOK_URL");
    return;
  }
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSlackPayload(info, jiraKey)),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (!res.ok) logger.error("Slack 알림 실패", { status: res.status });
  } catch (err) {
    logger.error("Slack 알림 실패", { error: errorMessage(err) });
  }
}

/** 사람에게 넘기기: Jira 이슈 → Slack 알림 순서. 절대 오류를 밖으로 던지지 않습니다. */
export async function escalate(env: Env, info: EscalationInfo): Promise<void> {
  const jiraKey = await createJiraIssue(env, info);
  await notifySlack(env, info, jiraKey);
  logger.info("담당자 연결 처리 완료", { channel: info.channel, category: info.reply.category, jiraKey });
}

/** 넘길 필요가 있을 때만 escalate를 실행합니다. (LINE·카카오 공통으로 사용) */
export async function escalateIfNeeded(env: Env, info: EscalationInfo): Promise<void> {
  if (shouldEscalate(info.reply)) await escalate(env, info);
}
