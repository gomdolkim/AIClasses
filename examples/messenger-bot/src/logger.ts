// ─────────────────────────────────────────────────────────────
// logger.ts — 기록(로그) 남기기 도우미
//
// 여기서 남긴 기록은 `npx wrangler tail` 또는 Cloudflare 대시보드의
// Logs 화면에서 볼 수 있습니다. 문제가 생겼을 때 원인을 찾는 "블랙박스" 역할입니다.
// 주의: 손님 메시지 원문·비밀값은 절대 기록하지 않습니다. (가린 글만 기록)
// ─────────────────────────────────────────────────────────────

type Detail = Record<string, unknown>;

/** 기록 한 줄을 JSON 글자로 만듭니다. 예: {"level":"error","msg":"Slack 전송 실패"} */
function format(level: string, msg: string, detail: Detail): string {
  return JSON.stringify({ level, msg, ...detail });
}

/** 오류 객체에서 사람이 읽을 수 있는 설명만 꺼냅니다. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const logger = {
  /** 평범한 진행 기록 */
  info(msg: string, detail: Detail = {}): void {
    console.log(format("info", msg, detail));
  },
  /** 문제가 생겼을 때의 기록 */
  error(msg: string, detail: Detail = {}): void {
    console.error(format("error", msg, detail));
  },
};
