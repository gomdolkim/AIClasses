// ─────────────────────────────────────────────────────────────
// types.ts — 이 봇에서 쓰는 "데이터 모양(형식)"을 한곳에 모아 둔 파일
//
// 프로그램끼리 데이터를 주고받을 때 "어떤 칸이 있는지"를 미리 정해 두면
// 오타나 빠뜨린 칸을 컴퓨터가 대신 찾아 줍니다. (실행 동작은 없습니다)
// ─────────────────────────────────────────────────────────────

/** Cloudflare에 등록한 비밀값(환경변수) 9개. `npx wrangler secret put 이름`으로 넣습니다. */
export interface Env {
  ANTHROPIC_API_KEY: string; // Claude API 키
  LINE_CHANNEL_SECRET: string; // LINE 채널 시크릿 (서명 확인용)
  LINE_CHANNEL_ACCESS_TOKEN: string; // LINE 채널 액세스 토큰 (답장 보내기용)
  SLACK_WEBHOOK_URL: string; // Slack #cs-escalation 채널 Incoming Webhook 주소
  JIRA_BASE_URL: string; // 예: https://내회사.atlassian.net
  JIRA_EMAIL: string; // Jira 로그인 이메일
  JIRA_API_TOKEN: string; // Jira API 토큰
  JIRA_PROJECT_KEY: string; // Jira 프로젝트 키 (봄날의 꽃 = BOM)
  KAKAO_SKILL_SECRET: string; // 카카오 스킬 URL 뒤에 붙이는 비밀 주소값 (?key=...)
}

/** 비어 있거나 등록되지 않은 비밀값의 이름 목록을 돌려줍니다. 예: ["SLACK_WEBHOOK_URL"] */
export function missingEnv(env: Env, keys: ReadonlyArray<keyof Env>): string[] {
  return keys.filter((key) => !env[key]?.trim());
}

/** 문의 분류 6가지 (교재 전체에서 같은 값을 씁니다) */
export const CATEGORIES = ["영업정보", "주문", "배송", "환불", "불만", "기타"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Claude가 돌려주는 답변 형식: { answer, category, needs_human } */
export interface BotReply {
  readonly answer: string; // 손님에게 보낼 답장 문장
  readonly category: Category; // 문의 분류
  readonly needs_human: boolean; // true면 사람(직원)에게 넘김
}

/** 직원에게 넘길 때 필요한 정보 */
export interface EscalationInfo {
  readonly channel: "LINE" | "카카오"; // 어느 메신저에서 온 문의인지
  readonly maskedText: string; // 개인정보를 가린 손님 메시지
  readonly reply: BotReply; // Claude의 판단 결과
}

// ── LINE이 보내 주는 데이터 모양 (필요한 칸만 적었습니다) ──
export interface LineEvent {
  readonly type: string; // "message", "follow"(친구 추가) 등
  readonly timestamp?: number; // 이벤트 발생 시각(밀리초). 너무 오래된 이벤트는 무시합니다.
  readonly replyToken?: string; // 답장할 때 쓰는 1회용 표 (1분 안에 사용)
  readonly source?: { readonly type: string; readonly userId?: string };
  readonly message?: { readonly type: string; readonly text?: string };
}

export interface LineWebhookBody {
  readonly events: readonly LineEvent[];
}

// ── 카카오 챗봇 스킬이 보내 주는 데이터 모양 (필요한 칸만) ──
export interface KakaoSkillRequest {
  readonly userRequest?: {
    readonly utterance?: string; // 손님이 입력한 문장
    readonly callbackUrl?: string; // 콜백을 켰을 때만 들어옴 (나중에 답을 보낼 주소)
  };
}
