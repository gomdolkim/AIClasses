import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildJiraPayload,
  buildSlackPayload,
  escalate,
  escapeSlack,
  jiraIssueType,
  shouldEscalate,
} from "../src/escalate";
import type { BotReply, EscalationInfo } from "../src/types";
import { bodiesSentTo, makeEnv } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reply = (over: Partial<BotReply> = {}): BotReply => ({
  answer: "담당자가 연락드릴게요",
  category: "기타",
  needs_human: true,
  ...over,
});

const info = (over: Partial<BotReply> = {}): EscalationInfo => ({
  channel: "LINE",
  maskedText: "관리 받은 뒤 얼굴이 붉어졌어요 [전화번호]",
  reply: reply(over),
});

describe("shouldEscalate (사람에게 넘길지 결정)", () => {
  it("needs_human이 true면 넘긴다", () => {
    expect(shouldEscalate(reply({ category: "관리상담", needs_human: true }))).toBe(true);
  });
  it("환불·불만은 needs_human이 false여도 넘긴다", () => {
    expect(shouldEscalate(reply({ category: "환불", needs_human: false }))).toBe(true);
    expect(shouldEscalate(reply({ category: "불만", needs_human: false }))).toBe(true);
  });
  it("평범한 FAQ 답변은 넘기지 않는다", () => {
    expect(shouldEscalate(reply({ category: "영업정보", needs_human: false }))).toBe(false);
  });
});

describe("jiraIssueType (Jira 이슈 유형)", () => {
  it("환불·불만은 클레임", () => {
    expect(jiraIssueType("환불")).toBe("클레임");
    expect(jiraIssueType("불만")).toBe("클레임");
  });
  it("예약은 예약", () => {
    expect(jiraIssueType("예약")).toBe("예약");
  });
  it("영업정보·관리상담·기타는 문의", () => {
    expect(jiraIssueType("영업정보")).toBe("문의");
    expect(jiraIssueType("관리상담")).toBe("문의");
    expect(jiraIssueType("기타")).toBe("문의");
  });
  it("예약 분류로 만든 Jira 이슈는 유형이 예약이다", () => {
    expect(buildJiraPayload("BOM", info({ category: "예약" })).fields.issuetype).toEqual({ name: "예약" });
  });
});

describe("buildSlackPayload / buildJiraPayload (알림 내용 만들기)", () => {
  it("Slack 메시지에 분류·채널·가린 메시지·Jira 키가 들어간다", () => {
    const { text } = buildSlackPayload(info({ category: "불만" }), "BOM-12");
    expect(text).toContain("불만");
    expect(text).toContain("LINE");
    expect(text).toContain("[전화번호]");
    expect(text).toContain("BOM-12");
  });

  it("Slack 메시지 첫 줄에 가게 이름(봄날 에스테틱)이 들어간다", () => {
    const [firstLine] = buildSlackPayload(info(), "BOM-12").text.split("\n");
    expect(firstLine).toContain("봄날 에스테틱");
    expect(firstLine).toContain("LINE");
  });

  it("Jira 키가 없으면 생성 실패를 표시한다", () => {
    expect(buildSlackPayload(info(), null).text).toContain("Jira 이슈 생성 실패");
  });

  it("Jira 이슈: 프로젝트 키, 이슈 유형, 요약, ADF 설명", () => {
    const payload = buildJiraPayload("BOM", info({ category: "환불" }));
    expect(payload.fields.project).toEqual({ key: "BOM" });
    expect(payload.fields.issuetype).toEqual({ name: "클레임" });
    expect(payload.fields.summary).toContain("[LINE/환불]");
    expect(payload.fields.description.type).toBe("doc");
    expect(payload.fields.description.version).toBe(1);
    expect(JSON.stringify(payload.fields.description)).toContain("[전화번호]");
  });

  it("요약은 255자를 넘지 않는다", () => {
    const long: EscalationInfo = { ...info(), maskedText: "가".repeat(500) };
    expect(buildJiraPayload("BOM", long).fields.summary.length).toBeLessThanOrEqual(255);
  });
});

describe("escalate (Slack + Jira 실제 전송)", () => {
  it("Jira 이슈를 만들고 그 키를 Slack에 알린다", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("atlassian")
        ? new Response(JSON.stringify({ key: "BOM-7" }), { status: 201 })
        : new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await escalate(makeEnv(), info({ category: "불만" }));

    const [jiraUrl, jiraInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(jiraUrl).toBe("https://bomnal.atlassian.test/rest/api/3/issue");
    const auth = (jiraInit.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${btoa("owner@bomnal.test:test-jira-token")}`);
    const [slack] = bodiesSentTo(fetchMock, "hooks.slack") as Array<{ text: string }>;
    expect(slack?.text).toContain("BOM-7");
  });

  it("Jira가 실패해도 Slack은 보내고, 오류를 기록하며, 예외를 던지지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("atlassian")
        ? new Response("bad issuetype", { status: 400 })
        : new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(escalate(makeEnv(), info())).resolves.toBeUndefined();

    expect(bodiesSentTo(fetchMock, "hooks.slack")).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Jira"));
  });

  it("Slack이 네트워크 오류를 내도 예외를 던지지 않고 기록한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("atlassian")
          ? new Response(JSON.stringify({ key: "BOM-1" }), { status: 201 })
          : Promise.reject(new Error("timeout")),
      ),
    );
    await expect(escalate(makeEnv(), info())).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Slack"));
  });

  it("Slack/Jira 비밀값이 비어 있으면 보내지 않고 오류만 기록한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await escalate(makeEnv({ SLACK_WEBHOOK_URL: "", JIRA_API_TOKEN: "" }), info());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("SLACK_WEBHOOK_URL"));
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("JIRA_API_TOKEN"));
  });

describe("Slack·Jira 안전 처리", () => {
  it("escapeSlack: <!channel>, <@U1>, 링크를 글자로 바꾼다", () => {
    expect(escapeSlack("<!channel> <@U1> <https://x.example|클릭> &")).toBe(
      "&lt;!channel&gt; &lt;@U1&gt; &lt;https://x.example|클릭&gt; &amp;",
    );
  });

  it("Slack 알림에는 손님 글·봇 답변의 멘션이 이스케이프되고 mrkdwn이 꺼진다", () => {
    const payload = buildSlackPayload(
      { channel: "LINE", maskedText: "<!channel> 긴급", reply: reply({ answer: "<!here> 확인" }) },
      "BOM-1",
    );
    expect(payload.text).not.toContain("<!channel>");
    expect(payload.text).not.toContain("<!here>");
    expect(payload.mrkdwn).toBe(false);
  });

  it("Slack 알림의 긴 글은 500자로 자른다", () => {
    const payload = buildSlackPayload({ ...info(), maskedText: "가".repeat(5000) }, null);
    expect(payload.text.length).toBeLessThan(1500);
  });

  it("Jira 제목에는 줄바꿈이 들어가지 않는다", () => {
    const payload = buildJiraPayload("BOM", { ...info(), maskedText: "첫 줄\n둘째 줄\r\n\t셋째" });
    expect(payload.fields.summary).not.toMatch(/[\r\n]/);
    expect(payload.fields.summary).toContain("첫 줄 둘째 줄 셋째");
  });
});
});
