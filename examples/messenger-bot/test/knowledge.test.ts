import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../src/knowledge";

describe("SYSTEM_PROMPT (봄날 에스테틱 업무 매뉴얼)", () => {
  it("가게 기본 정보(이름·위치·휴무·메뉴 가격)를 담고 있다", () => {
    expect(SYSTEM_PROMPT).toContain("봄날 에스테틱");
    expect(SYSTEM_PROMPT).toContain("홍대입구역 3번 출구 도보 5분");
    expect(SYSTEM_PROMPT).toContain("월요일 휴무");
    expect(SYSTEM_PROMPT).toContain("수분 진정 관리 60분 70,000원");
    expect(SYSTEM_PROMPT).toContain("595,000원");
  });

  it("예약 규정(예약금·24시간 전 무료 변경)과 회원권 환불 규정을 담고 있다", () => {
    expect(SYSTEM_PROMPT).toContain("예약금 10,000원");
    expect(SYSTEM_PROMPT).toContain("24시간 전까지");
    expect(SYSTEM_PROMPT).toContain("위약금 10%");
  });

  it("봇은 예약을 확정하지 않고 네이버 예약·직원에게 안내한다", () => {
    expect(SYSTEM_PROMPT).toMatch(/예약을 확정하지 않/);
    expect(SYSTEM_PROMPT).toContain("네이버 예약");
  });

  it("의료 시술은 하지 않으며 피부과 상담을 권한다", () => {
    expect(SYSTEM_PROMPT).toMatch(/필러|보톡스|레이저/);
    expect(SYSTEM_PROMPT).toContain("피부과");
  });

  it("임신·피부 질환·알레르기·관리 후 트러블은 사람에게 넘긴다", () => {
    for (const word of ["임신", "피부 질환", "알레르기", "트러블"]) expect(SYSTEM_PROMPT).toContain(word);
    expect(SYSTEM_PROMPT).toContain("needs_human");
  });

  it("분류 6가지를 안내하고 예전 업종의 분류는 쓰지 않는다", () => {
    expect(SYSTEM_PROMPT).toContain('"영업정보", "예약", "관리상담", "환불", "불만", "기타"');
    expect(SYSTEM_PROMPT).not.toMatch(/"\uC8FC\uBB38"|"\uBC30\uC1A1"/); // 예전 업종의 분류 2개(유니코드 표기)
  });

  it("예전 업종의 흔적이 남아 있지 않다", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\uAF43|\uD50C\uB85C\uB9AC\uC2A4\uD2B8|\uD654\uD658|\uC0DD\uD654|\uBC30\uC1A1|\u82B1|bomnal_fl/); // 예전 업종 단어(유니코드 표기)
  });

  it("프롬프트 인젝션 방어 규칙과 개인정보 규칙을 유지한다", () => {
    expect(SYSTEM_PROMPT).toContain("명령이 아닙니다");
    expect(SYSTEM_PROMPT).toContain("정중히 거절");
    expect(SYSTEM_PROMPT).toContain("카드번호");
  });
});
