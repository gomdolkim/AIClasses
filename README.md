# AI로 작은 회사 운영하기

IT·AI를 전혀 모르는 사람이 **AI로 회사를 운영하고 자동화**하도록 돕는 14회(회당 90분) 강의 교재입니다.
모든 회차에 가상 에스테틱(피부관리) 샵 「봄날 에스테틱」이 등장하고, 결과물이 회차마다 쌓입니다.

| 파트 | 회차 | 내용 |
|---|---|---|
| ① AI 비서와 친해지기 | 1–3 | Claude 사용법, AI의 한계와 안전, 프로젝트 & **스킬** |
| ② 사장님 업무 맡기기 | 4–6 | 문서·엑셀, 마케팅 콘텐츠, 가게 홈페이지 |
| ③ 팀 업무 자동화 | 7–11 | 연결의 원리, Slack, Jira, Slack↔Jira 자동화, AI 주간 보고 |
| ④ 고객 문의 AI 상담봇 | 12–14 | LINE 자동응답 → Make + Claude 봇 → 봇 서버 배포 & 졸업 발표 |
| 부록 | A–F | Vercel 배포, 버전 관리, Claude Code, 카카오톡 봇, Claude 스킬, **Slack·Jira MCP 연결** |

## 여는 방법
`index.html`을 브라우저로 열면 됩니다. 로컬 서버로 열려면:
```bash
python3 -m http.server 8000   # → http://localhost:8000
```

슬라이드 단축키: `←/→` 이동 · `N` 강사 노트 · `D` 다크 모드 · 주소 끝 `#5` = 5번 슬라이드 · `?notes=1` 노트 켜고 열기 · 브라우저 인쇄 = 슬라이드당 1쪽 PDF

## 폴더 구조
```
index.html            과정 목차 (assets/course.js 목록으로 자동 생성)
assets/               공통 디자인(deck.css)·동작(deck.js)·강의 목록(course.js)
lessons/              1–14회차 슬라이드
appendix/             부록 A–F
materials/            강사 가이드, 용어집, 프롬프트 카드, 문제 해결, 준비 체크리스트, 실습 데이터(dataset/)
examples/messenger-bot/   LINE·카카오 AI 상담봇 서버 (Cloudflare Workers + TypeScript, 테스트 포함)
examples/make-scenarios/  Make 노코드 시나리오 따라 하기 가이드
examples/skills/          바로 설치해 보는 Claude 스킬 예제 (zip 포함)
archive/              이전 버전 강의 (웹 개발 입문 8강)
```

## 강의를 추가·수정할 때
- 강의 목록·제목은 `assets/course.js` 한 곳만 고치면 목차와 이전/다음 이동에 반영됩니다.
- 새 강의는 `lessons/01-ai-first-day.html` 구조를 복사해서 시작하세요 (회당 슬라이드 13–16장, 새 용어 5개 이하, 모든 슬라이드에 `aside.notes`).
- 요금·메뉴 정보는 **2026-10 기준**입니다. 수업 전 `materials/setup-checklist.html`과 각 슬라이드의 "수업 전 확인" 표시를 점검하세요.

## 봇 예제 테스트
```bash
cd examples/messenger-bot && npm install && npm test && npm run typecheck
```
