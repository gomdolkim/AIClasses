import { describe, expect, it } from "vitest";
import { maskPersonalInfo } from "../src/privacy";

describe("maskPersonalInfo (개인정보 가리기)", () => {
  it("한국 휴대폰 번호를 가린다", () => {
    expect(maskPersonalInfo("연락처 010-1234-5678 입니다")).toBe("연락처 [전화번호] 입니다");
    expect(maskPersonalInfo("01012345678로 주세요")).toBe("[전화번호]로 주세요");
  });

  it("일본 전화번호와 국제번호를 가린다", () => {
    expect(maskPersonalInfo("090-1234-5678")).toBe("[전화번호]");
    expect(maskPersonalInfo("+81 90 1234 5678")).toBe("[전화번호]");
    expect(maskPersonalInfo("+82-10-1234-5678")).toBe("[전화번호]");
  });

  it("카드번호처럼 긴 숫자를 가린다", () => {
    expect(maskPersonalInfo("카드 1234-5678-9012-3456 로 결제")).toBe("카드 [카드번호] 로 결제");
    expect(maskPersonalInfo("4111111111111111")).toBe("[카드번호]");
  });

  it("주민등록번호를 가린다", () => {
    expect(maskPersonalInfo("900101-1234567")).toBe("[주민번호]");
  });

  it("이메일을 가린다", () => {
    expect(maskPersonalInfo("hana.kim+1@example.co.jp 로 보내줘")).toBe("[이메일] 로 보내줘");
  });

  it("가격·날짜·시간 같은 평범한 숫자는 그대로 둔다", () => {
    const text = "꽃다발 M 55,000원, 2026-10-10 오후 3시, 주문번호 12345";
    expect(maskPersonalInfo(text)).toBe(text);
  });

  it("여러 개인정보가 섞여 있어도 모두 가리고 원문은 바꾸지 않는다", () => {
    const original = "a@b.com / 010-1111-2222";
    const masked = maskPersonalInfo(original);
    expect(masked).toBe("[이메일] / [전화번호]");
    expect(original).toBe("a@b.com / 010-1111-2222");
  });

  it("전각 숫자·일본식 줄표 전화번호도 가린다", () => {
    expect(maskPersonalInfo("０９０－１２３４－５６７８")).toBe("[전화번호]");
    expect(maskPersonalInfo("090ー1234ー5678")).toBe("[전화번호]");
    expect(maskPersonalInfo("010.1234.5678")).toBe("[전화번호]");
    expect(maskPersonalInfo("02-123-4567")).toBe("[전화번호]");
  });

  it("외국인등록번호와 띄어 쓴 카드번호를 가린다", () => {
    expect(maskPersonalInfo("900101-5234567")).toBe("[주민번호]");
    expect(maskPersonalInfo("4111 1111 1111 1111")).toBe("[카드번호]");
  });

  it("Luhn이 맞지 않는 긴 주문번호는 카드로 오해하지 않는다", () => {
    expect(maskPersonalInfo("주문번호 20261010123456 확인")).toBe("주문번호 20261010123456 확인");
  });

  it("가격 표기와 전각 물음표 같은 다른 글자는 바꾸지 않는다", () => {
    expect(maskPersonalInfo("1,200,000원 / 営業時間は？")).toBe("1,200,000원 / 営業時間は？");
  });
});
