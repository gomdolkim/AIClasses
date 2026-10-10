// ─────────────────────────────────────────────────────────────
// security.ts — 보안 도우미 (LINE·카카오가 함께 씁니다)
// ─────────────────────────────────────────────────────────────

/** 바깥 서비스 호출이 멈춰 버리지 않도록 정해 두는 제한 시간 (밀리초) */
export const OUTBOUND_TIMEOUT_MS = 10_000;

/** 두 글자가 같은지 "항상 같은 시간"에 비교합니다. (시간 차이로 정답을 추측하는 공격 방지) */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
