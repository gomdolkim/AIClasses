/* 과정 전체 목록 — 목차(index.html)와 각 강의의 이전/다음 이동이 이 파일 하나를 기준으로 만들어집니다. */
window.COURSE = Object.freeze({
  title: 'AI로 작은 회사 운영하기',
  updated: '2026-10',
  company: '봄날 에스테틱',
  parts: [
    { id: 1, name: 'AI 비서와 친해지기', color: 'pink' },
    { id: 2, name: '사장님 업무 맡기기', color: 'lavender' },
    { id: 3, name: '팀 업무 자동화 (Slack · Jira)', color: 'sky' },
    { id: 4, name: '고객 문의 AI 상담봇 (LINE)', color: 'mint' }
  ],
  lessons: [
    { n: 1, part: 1, slug: '01-ai-first-day', title: 'AI 비서 첫 출근', outcome: 'Claude에 가입하고 좋은 요청 4요소로 업무를 맡긴다', deliverable: '가게 소개문 + 공지 3종' },
    { n: 2, part: 1, slug: '02-ai-strengths-limits', title: 'AI가 잘하는 일, 틀리는 일', outcome: '할루시네이션·개인정보 위험을 알고 안전하게 쓴다', deliverable: '우리 회사 AI 사용 수칙 1쪽' },
    { n: 3, part: 1, slug: '03-company-ai-project', title: '우리 회사 전용 AI: 프로젝트 & 스킬', outcome: '프로젝트에 회사 자료를 넣고, 스킬을 설치해 업무 방식을 가르친다', deliverable: '봄날 에스테틱 프로젝트 + 첫 스킬 설치' },
    { n: 4, part: 2, slug: '04-docs-and-sheets', title: '문서·엑셀 업무 맡기기', outcome: '파일을 올려 요약·정리·양식 작성을 맡긴다', deliverable: '월간 예약·매출 요약 + 고객 관리 차트 양식' },
    { n: 5, part: 2, slug: '05-marketing-content', title: '마케팅 콘텐츠 만들기', outcome: '브랜드 말투로 홍보 글을 만들고 다듬는다', deliverable: '인스타 1주치 + 예약 리마인드·이벤트 문자' },
    { n: 6, part: 2, slug: '06-shop-homepage', title: '가게 홈페이지 만들기', outcome: '아티팩트로 홈페이지를 만들어 링크로 공유한다', deliverable: '1페이지 샵 소개 사이트(예약 버튼)' },
    { n: 7, part: 3, slug: '07-how-connections-work', title: '연결의 원리: API와 웹훅', outcome: '프로그램끼리 대화하는 방법을 그림으로 설명한다', deliverable: '예약→관리→사후 연락 흐름도' },
    { n: 8, part: 3, slug: '08-slack-team', title: 'Slack으로 팀 소통하기', outcome: '채널을 설계하고 매일 아침 스탠드업 봇을 만든다', deliverable: '채널 구성 + 스탠드업 워크플로' },
    { n: 9, part: 3, slug: '09-jira-tasks', title: 'Jira로 할 일 관리하기', outcome: '예약을 이슈로 만들고 보드로 흐름을 관리한다', deliverable: '예약→관리→사후 연락 보드' },
    { n: 10, part: 3, slug: '10-slack-jira-automation', title: 'Slack과 Jira 자동으로 잇기', outcome: '문의가 Jira 이슈가 되고 완료되면 Slack에 알린다', deliverable: '문의→이슈→완료 알림 자동화' },
    { n: 11, part: 3, slug: '11-ai-weekly-report', title: 'AI가 주간 보고를 대신 쓴다', outcome: 'Claude가 Jira를 읽고 보고서를 Slack에 올린다', deliverable: '자동 주간 보고' },
    { n: 12, part: 4, slug: '12-line-auto-reply', title: '코딩 없이 LINE 자동응답', outcome: 'LINE 공식계정에 FAQ 자동응답을 설정한다', deliverable: 'FAQ 10개 자동응답' },
    { n: 13, part: 4, slug: '13-nocode-ai-bot', title: 'Make + Claude로 AI 상담봇', outcome: 'AI가 답하고, 어려운 건 Slack·Jira로 넘긴다', deliverable: 'LINE AI 상담봇 + 사람 연결' },
    { n: 14, part: 4, slug: '14-bot-server-graduation', title: 'Claude가 짜준 봇 서버 & 졸업', outcome: 'AI가 만든 봇 서버를 배포하고 도입 계획을 발표한다', deliverable: '배포된 봇 + AI 도입 계획서' }
  ],
  appendix: [
    { id: 'A', slug: 'a-vercel-deploy', title: '홈페이지를 인터넷에 올리기 (GitHub + Vercel)' },
    { id: 'B', slug: 'b-version-control', title: '버전 관리 기초 (Git을 몰라도 되는 만큼만)' },
    { id: 'C', slug: 'c-claude-code', title: '심화: Claude Code로 직접 만들기' },
    { id: 'D', slug: 'd-kakao-bot', title: '카카오톡 채널 자동응답 & 챗봇' },
    { id: 'E', slug: 'e-claude-skills', title: 'Claude 스킬 설치·사용·직접 만들기' }
  ],
  materials: [
    { slug: 'instructor-guide', title: '강사 가이드' },
    { slug: 'glossary', title: '누적 용어집' },
    { slug: 'prompt-cards', title: '프롬프트 카드' },
    { slug: 'troubleshooting', title: '문제 해결 카드' },
    { slug: 'setup-checklist', title: '수업 전 준비·계정 체크리스트' }
  ]
});
