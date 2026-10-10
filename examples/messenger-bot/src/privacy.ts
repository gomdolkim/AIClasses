// ─────────────────────────────────────────────────────────────
// privacy.ts — 개인정보 가리기(마스킹)
//
// 손님이 실수로 전화번호·카드번호·이메일을 보내도
// Claude, Slack, Jira에는 "[전화번호]"처럼 가린 글만 전달합니다.
// (원래 글은 바꾸지 않고, 가린 "새 글"을 만들어 돌려줍니다)
//
// 한계: 이름·주소처럼 "생김새로 찾을 수 없는" 정보는 가리지 못합니다.
//       그래서 손님에게 개인정보를 메신저로 보내지 말라고 안내하는 것도 꼭 필요합니다.
// ─────────────────────────────────────────────────────────────

/** 숫자 사이에 올 수 있는 구분 글자: 띄어쓰기 . - 그리고 일본어에서 쓰는 비슷한 줄표(‐ ― − ー) */
const SEP = "[ .\\-\\u2010-\\u2015\\u2212\\u30FC]";

/** Luhn 검사: 진짜 카드번호만 통과하는 계산식 (주문번호 같은 긴 숫자를 카드로 오해하지 않기 위해) */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** 카드번호 후보 → 붙어 있는 숫자는 Luhn을 통과해야, 띄어 쓴 묶음(1234 5678 ...)은 모양만으로 가립니다. */
function maskCard(candidate: string): string {
  const grouped = /[ \-]/.test(candidate);
  return grouped || passesLuhn(candidate.replace(/\D/g, "")) ? "[카드번호]" : candidate;
}

/** 찾을 무늬(정규식)와 바꿀 글자의 짝. 위에서부터 순서대로 적용합니다. */
const MASK_RULES: ReadonlyArray<readonly [RegExp, string | ((m: string) => string)]> = [
  // 이메일: 글자@글자.글자
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]"],
  // 주민등록번호: 앞 6자리 - 뒤 7자리 (뒷자리 첫 숫자 1~4 내국인, 5~8 외국인)
  [new RegExp(`(?<!\\d)\\d{6}${SEP}?[1-8]\\d{6}(?!\\d)`, "g"), "[주민번호]"],
  // 카드번호: 숫자 13~19개 (사이에 띄어쓰기·하이픈 허용)
  [new RegExp(`(?<![\\d+])\\d(?:${SEP}?\\d){12,18}(?!\\d)`, "g"), maskCard],
  // 전화번호: +국가번호로 시작하거나 0으로 시작하는 번호 (예: 010-1234-5678, 090-1234-5678)
  [
    new RegExp(`(?<!\\d)(?:\\+\\d{1,3}${SEP}?\\d{1,4}|0\\d{1,3})${SEP}?\\d{3,4}${SEP}?\\d{4}(?!\\d)`, "g"),
    "[전화번호]",
  ],
];

/**
 * 글 안의 개인정보를 가린 새 글을 돌려줍니다.
 * 예: "010-1234-5678로 연락주세요" → "[전화번호]로 연락주세요"
 * 먼저 전각 숫자(０９０)·전각 ＠·전각 줄표(－)를 보통 글자로 바꿔 일본어 입력도 잡아냅니다.
 * (다른 글자는 그대로 둡니다. 직원이 읽을 원래 문장을 최대한 지키기 위해서입니다)
 */
export function maskPersonalInfo(text: string): string {
  const normalized = text.replace(/[\uFF10-\uFF19\uFF20\uFF0D\uFF0E]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  return MASK_RULES.reduce(
    (masked, [pattern, label]) => masked.replace(pattern, label as string),
    normalized,
  );
}
