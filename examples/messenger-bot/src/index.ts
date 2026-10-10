// ─────────────────────────────────────────────────────────────
// index.ts — 봇의 "안내 데스크" (라우터)
//
// 인터넷에서 요청이 들어오면 주소를 보고 담당 부서로 보냅니다.
//   GET  /             → "작동 중" 확인 글 (브라우저로 열어 보세요)
//   POST /line/webhook → LINE 처리 (line.ts)
//   POST /kakao/skill  → 카카오 처리 (kakao.ts, 부록 D)
// 담당 부서로 보내기 전에, 꼭 필요한 비밀값이 등록되어 있는지 확인합니다.
// ─────────────────────────────────────────────────────────────

import { handleKakaoSkill } from "./kakao";
import { handleLineWebhook } from "./line";
import { logger } from "./logger";
import { missingEnv, type Env } from "./types";

export { missingEnv }; // 테스트에서 쓰려고 내보냅니다.

/** 경로별로 반드시 있어야 하는 비밀값 (Slack·Jira는 없으면 직원 연결만 건너뜁니다) */
const REQUIRED_FOR_LINE: ReadonlyArray<keyof Env> = [
  "ANTHROPIC_API_KEY",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
];
// 카카오는 서명이 없어서, 비밀 주소값(KAKAO_SKILL_SECRET)이 없으면 아예 열지 않습니다. (안전한 기본값)
const REQUIRED_FOR_KAKAO: ReadonlyArray<keyof Env> = ["ANTHROPIC_API_KEY", "KAKAO_SKILL_SECRET"];

/** 비밀값이 빠졌으면 기록을 남기고 500 응답을 만듭니다. 모두 있으면 null. */
function checkEnv(env: Env, keys: ReadonlyArray<keyof Env>): Response | null {
  const lacks = missingEnv(env, keys);
  if (lacks.length === 0) return null;
  logger.error(`비밀값이 등록되지 않았어요: ${lacks.join(", ")} → npx wrangler secret put 이름`);
  return new Response("Server not configured", { status: 500 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;

    if (route === "GET /") {
      return new Response("봄날의 꽃 상담 봇이 작동 중입니다. 🌷", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (route === "POST /line/webhook") {
      return checkEnv(env, REQUIRED_FOR_LINE) ?? handleLineWebhook(request, env, ctx);
    }
    if (route === "POST /kakao/skill") {
      return checkEnv(env, REQUIRED_FOR_KAKAO) ?? handleKakaoSkill(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
