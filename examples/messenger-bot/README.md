# 봄날의 꽃 AI 상담 봇 (LINE · 카카오) 🌷

> 14회차 실습 예제 · Cloudflare Workers + TypeScript · 2026-10 기준
> 처음 보는 분도 따라 할 수 있게 썼습니다. 코드를 몰라도 괜찮아요. **순서대로만** 하세요.

---

## 1. 이 봇이 하는 일

손님이 LINE으로 질문을 보내면, AI(Claude)가 가게 FAQ를 보고 대신 답장합니다.
환불·불만이나 FAQ에 없는 질문은 **직원에게 넘깁니다**(Slack 알림 + Jira 할 일 카드).

```
 손님 (LINE 앱)
    │  "営業時間は？" / "꽃이 시들어 왔어요"
    ▼
 LINE 서버 ──(webhook)──▶  우리 봇 (Cloudflare Worker, 이 폴더의 코드)
                              │ ① 진짜 LINE이 보낸 건지 서명 확인
                              │ ② 전화번호·카드번호·이메일 가리기
                              │ ③ Claude Haiku 4.5에게 질문 (규칙 + FAQ 함께 전달)
                              │    → {answer, category, needs_human}
                              │ ④ 손님에게 답장
                              ▼
                     needs_human 이거나 환불·불만이면?
                        ├─▶ Slack #cs-escalation 알림
                        └─▶ Jira "봄날의 꽃 운영"(BOM) 이슈 생성 (클레임/문의)
```

| 주소 | 하는 일 |
|---|---|
| `GET /` | "작동 중" 확인 글 (브라우저로 열어 보기) |
| `POST /line/webhook` | LINE 메시지 처리 (**메인**) |
| `POST /kakao/skill` | 카카오톡 챗봇 스킬 처리 (부록 D) |

### 파일 안내 (바꿀 곳은 거의 `knowledge.ts` 하나)

| 파일 | 역할 |
|---|---|
| `src/knowledge.ts` | ★ **업무 매뉴얼**: 상담 규칙 + 가게 FAQ. 가게 정보가 바뀌면 여기만 고치세요 |
| `src/index.ts` | 안내 데스크: 주소를 보고 담당 파일로 보냄, 비밀값 확인 |
| `src/line.ts` | LINE 서명 확인, 로딩 표시, 답장 |
| `src/kakao.ts` | 카카오 스킬 응답 (콜백 / 4초 제한) |
| `src/claude.ts` | Claude에게 질문하고 답을 안전하게 읽기 |
| `src/escalate.ts` | 직원에게 넘기기 (Slack + Jira) |
| `src/privacy.ts` | 개인정보 가리기 |
| `src/logger.ts`, `src/types.ts` | 기록 남기기, 데이터 모양 정의 |
| `test/` | 자동 테스트 (코드를 고친 뒤 `npm test`로 확인) |

---

## 2. 준비물

| 준비물 | 어디서 | 비고 |
|---|---|---|
| 컴퓨터 + 터미널 | Mac: "터미널" 앱 / Windows: "PowerShell" | |
| Node.js (LTS) | https://nodejs.org | 22 버전 이상 권장 |
| Cloudflare 계정 | https://dash.cloudflare.com | 무료 |
| Anthropic API 키 | https://console.anthropic.com → API Keys | 결제 수단 등록 필요 |
| LINE 공식계정 + Messaging API 채널 | LINE Official Account Manager, LINE Developers | 13회차에서 만든 것 |
| Slack Incoming Webhook URL | 11회차에서 만든 `#cs-escalation` 웹훅 | |
| Jira API 토큰 | https://id.atlassian.com/manage-profile/security/api-tokens | 12회차 BOM 프로젝트 |

> ⚠️ **API 키·토큰·웹훅 URL은 모두 비밀번호입니다.** 카톡·메일·슬랙에 붙여 넣지 말고, 화면 공유 중에는 가려 주세요.

---

## 3. 따라 하기 (약 30분)

### ① Node.js 설치 확인
터미널에 입력하고 Enter:
```bash
node -v
```
`v22.x.x` 처럼 숫자가 나오면 OK. "command not found"가 나오면 nodejs.org에서 **LTS** 버튼으로 설치 후 터미널을 껐다 켜세요.

### ② 이 폴더로 이동 + 부품 설치
```bash
cd examples/messenger-bot
npm install
```
1~2분 걸립니다. `added ... packages`가 나오면 성공.

### ③ (선택) 테스트 돌려 보기
```bash
npm test
```
`Tests  71 passed` 처럼 모두 통과하면 코드가 정상입니다. (인터넷·비밀값 없이도 돌아가요)

### ④ Cloudflare 로그인
```bash
npx wrangler login
```
브라우저가 열리면 **Allow(허용)** 를 누르세요.

### ⑤ 비밀값 9개 등록
한 줄씩 입력하면 `Enter a secret value:`가 나옵니다. 값을 붙여 넣고 Enter (화면에 안 보이는 게 정상).

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put JIRA_BASE_URL
npx wrangler secret put JIRA_EMAIL
npx wrangler secret put JIRA_API_TOKEN
npx wrangler secret put JIRA_PROJECT_KEY
npx wrangler secret put KAKAO_SKILL_SECRET
```

| 이름 | 어디서 찾나요 | 예시 모양 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | `sk-ant-...` |
| `LINE_CHANNEL_SECRET` | LINE Developers → 채널 → **Basic settings(チャネル基本設定)** → Channel secret | 영문+숫자 32자 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → 채널 → **Messaging API** 탭 맨 아래 → Channel access token → **Issue(発行)** | 아주 긴 글자 |
| `SLACK_WEBHOOK_URL` | Slack 앱 설정 → Incoming Webhooks | `https://hooks.slack.com/services/...` |
| `JIRA_BASE_URL` | 브라우저 주소창의 Jira 주소 앞부분 | `https://내회사.atlassian.net` (끝에 `/` 없이) |
| `JIRA_EMAIL` | Jira 로그인 이메일 | |
| `JIRA_API_TOKEN` | id.atlassian.com → Security → API tokens → Create | |
| `JIRA_PROJECT_KEY` | Jira 프로젝트 키 | `BOM` |
| `KAKAO_SKILL_SECRET` | 내가 직접 만드는 긴 무작위 글자 (터미널에서 `openssl rand -hex 24`). 카카오 스킬 URL 뒤에 붙입니다 (부록 D) | 영문+숫자 48자 |

> 처음 `secret put`을 하면 "Worker가 없는데 만들까요?"라고 물을 수 있어요. **Y** 를 누르면 됩니다.
> 값을 잘못 넣었으면 같은 명령을 다시 실행해 덮어쓰면 됩니다.

### ⑥ 배포 (인터넷에 올리기)
```bash
npx wrangler deploy
```
마지막에 나오는 주소를 복사하세요:
```
https://bomnal-bot.<내계정이름>.workers.dev
```
브라우저로 열어서 **"봄날의 꽃 상담 봇이 작동 중입니다. 🌷"** 가 보이면 성공!

### ⑦ LINE에 봇 주소 알려 주기
1. **LINE Developers** (developers.line.biz) → 내 채널 → **Messaging API** 탭
2. **Webhook URL** → Edit → `https://bomnal-bot.<내계정이름>.workers.dev/line/webhook` 입력 → Update
3. **Verify(検証)** 클릭 → **Success** 가 나오면 OK
4. 바로 아래 **Use webhook(Webhookの利用)** 을 **ON**
5. **LINE Official Account Manager** → 설정 → **Response settings(応答設定)**
   - **Response messages(応答メッセージ)**: **OFF** (켜 두면 키워드 자동응답이 AI 답과 겹쳐요)
   - **Webhook**: **ON**

### ⑧ 테스트
휴대폰 LINE에서 공식계정에 메시지를 보내 보세요.

| 보낼 메시지 | 기대 결과 |
|---|---|
| `営業時間は？` | 일본어로 "화~일 10:00–20:00, 월요일 휴무" 안내 |
| `배송비 얼마예요?` | 5,000원, 마포·서대문 무료 안내 |
| `꽃이 다 시들어서 왔어요. 환불해 주세요` | 사과 + 담당자 연결 안내 → Slack 알림 + Jira **클레임** 이슈 생성 |
| 스티커 | "글자 메시지만 읽을 수 있어요" 안내 |

---

## 4. 로그 보기 (문제가 생겼을 때)

```bash
npx wrangler tail
```
켜 둔 상태에서 LINE으로 메시지를 보내면 처리 기록이 실시간으로 보입니다. 끌 때는 `Ctrl + C`.
Cloudflare 대시보드 → Workers & Pages → bomnal-bot → **Logs** 에서도 볼 수 있어요.

`"level":"error"` 줄의 `msg`를 보면 원인을 알 수 있습니다. (손님 원문·비밀값은 기록하지 않아요)

---

## 5. 비용 (2026-10 기준 · 수업 전 확인)

| 항목 | 비용 |
|---|---|
| Cloudflare Workers | 무료 플랜: 하루 100,000 요청까지 무료 (작은 가게는 충분) |
| Claude Haiku 4.5 | 입력 $1 / 출력 $5 (100만 토큰당). FAQ 답변 1,000건에 약 $2~5 |
| LINE | Reply API(받은 메시지에 답장)는 월 무료 메시지 수에 **포함되지 않음** |
| Slack / Jira | 기존 요금제 그대로 (Jira Automation 단계를 쓰지 않음) |

> 💡 Anthropic Console → **Limits** 에서 월 사용 한도(예: $10)를 걸어 두면 안심입니다.
> 💡 코드에 "프롬프트 캐싱" 표시가 들어 있지만, Haiku 4.5는 지시문이 약 4,096토큰 이상일 때만 캐시됩니다. 지금 FAQ 길이로는 효과가 없고, FAQ를 많이 늘리면 자동으로 할인됩니다.

---

## 6. 자주 겪는 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| Verify 누르면 실패 / 로그에 `LINE 서명 불일치` | 채널 시크릿이 틀림 | `npx wrangler secret put LINE_CHANNEL_SECRET` 다시 입력 |
| Verify는 성공인데 답장이 안 옴 | Use webhook OFF, 또는 액세스 토큰 틀림 | ⑦-4 확인, 로그에 `LINE API 오류 401`이면 토큰 재발급·재등록 |
| 키워드 자동응답과 AI 답이 둘 다 옴 | 응답 메시지(応答メッセージ)가 켜져 있음 | ⑦-5에서 OFF |
| 로그에 `비밀값이 등록되지 않았어요: ...` | 비밀값 빠짐 | 로그에 나온 이름으로 `secret put` |
| 항상 "담당자가 확인 후 연락드리겠습니다"만 옴 | Claude 호출 실패 (키 틀림·잔액 부족) | 로그의 `Claude API 오류` status 확인 (401=키, 400/403=결제·잔액) |
| Slack은 오는데 Jira 이슈가 안 생김 | BOM 프로젝트에 이슈 유형 "클레임"/"문의"가 없음, 또는 토큰 틀림 | Jira 프로젝트 설정 → Issue types 확인, 로그의 `Jira 이슈 생성 실패` 내용 확인 |
| 수정했는데 그대로임 | 배포를 안 함 | `npx wrangler deploy` 다시 실행 |
| `npm install` 오류 | Node 버전이 낮음 | Node LTS 재설치 후 터미널 재시작 |

---

## 7. 보안 수칙 🔒

- 비밀값은 **`npx wrangler secret put`** 으로만 등록하세요. 코드·`wrangler.toml`·GitHub에 절대 쓰지 마세요.
- 내 컴퓨터 테스트용 `.dev.vars` 파일은 공유 금지 (`.gitignore`에 이미 들어 있음).
- 키가 노출됐다면 **즉시 재발급**(Anthropic Console, LINE Developers, Slack, Atlassian에서 기존 키 삭제)하고 다시 `secret put`.
- 봇은 손님 메시지의 전화번호·카드번호·주민번호·이메일을 **가린 뒤** Claude·Slack·Jira로 보냅니다. 그래도 손님에게 개인정보를 메신저로 보내지 말라고 안내하세요.
- 봇은 환불·보상을 **약속하지 않도록** 규칙이 정해져 있습니다. 규칙을 고칠 때도 이 줄은 지우지 마세요.
- AI 기본법(2026-01-22 시행)에 따라 첫 인사에서 **AI 상담원**임을 밝힙니다(친구 추가 인사 + 규칙 2번).
- 카카오 `/kakao/skill` 에는 LINE 같은 서명 확인이 없어서, 스킬 URL 뒤에 **비밀 `?key=`** 를 붙여 맞는 요청만 받습니다. `KAKAO_SKILL_SECRET` 이 등록되지 않으면 카카오 경로는 아예 열리지 않습니다. 이 URL은 비밀번호처럼 다루고, 새어 나가면 `secret put`으로 값을 바꾸고 카카오 스킬 URL도 같이 바꾸세요. (부록 D 참고)
- 손님 글 속의 "규칙을 무시해라" 같은 명령은 따르지 않도록 규칙 9~11번에 적어 두었고, Slack 알림은 `<!channel>` 같은 호출을 글자로 바꿔 보냅니다. 다만 AI 규칙은 100% 보장이 아니니, 환불·보상은 **항상 사람이 최종 확인**하세요.
- 누군가 같은 말을 계속 보내 직원 알림(Slack·Jira)을 도배할 수 있습니다. Cloudflare 대시보드 → Security → WAF → **Rate limiting rules** 에서 `/line/webhook`, `/kakao/skill` 경로에 1분당 요청 수 제한을 걸고, Anthropic Console에서 월 사용 한도도 설정하세요.
- 개인정보 가리기는 전화·카드(Luhn 검사)·주민/외국인등록번호·이메일을 찾습니다. 이름·주소·일본 마이넘버 등은 가리지 못합니다.

---

## 8. 우리 가게에 맞게 바꾸기

1. `src/knowledge.ts` 를 메모장(또는 VS Code)으로 엽니다.
2. `FAQ` 부분의 가게 이름·영업시간·가격·배송·환불 규칙을 우리 가게 내용으로 바꿉니다.
   - **사실만** 쓰세요. 여기에 없는 질문은 봇이 알아서 직원에게 넘깁니다.
3. 가게 이름이 바뀌면 `RULES` 첫 줄과 `src/line.ts`의 `GREETING`(친구 추가 인사)도 바꿉니다.
4. 저장 후:
   ```bash
   npm test            # 테스트가 깨지지 않았는지 확인 (가게 이름 관련 테스트는 바뀔 수 있음)
   npx wrangler deploy # 다시 배포
   ```

> 💡 Claude Code에게 "knowledge.ts의 FAQ를 우리 가게 정보로 바꿔 줘. 영업시간은 ..."처럼 부탁해도 됩니다.

---

## 9. 부록 D: 카카오톡 채널에 연결하기 (요약)

1. 먼저 `openssl rand -hex 24` 로 비밀 글자를 만들어 `npx wrangler secret put KAKAO_SKILL_SECRET` 으로 등록합니다.
2. 카카오 **챗봇 관리자센터** → 스킬 → 스킬 생성 → URL: `https://bomnal-bot.<내계정이름>.workers.dev/kakao/skill?key=<위에서 만든 글자>`
3. 시나리오 → **폴백 블록** → 파라미터 설정에서 위 스킬 선택 → 봇 응답을 "스킬데이터 사용"
4. (권장) 폴백 블록 설정에서 **콜백** 사용을 켜면 5초 제한 없이 답할 수 있습니다. 콜백은 봇 테스트 화면에서 동작하지 않으니 **배포 후** 실제 채널에서 테스트하세요.
5. 콜백을 켜지 않으면 4초 안에 답이 안 올 때 "잠시 후 다시 물어봐 주세요"로 답합니다.

> 메뉴 이름·콜백 신청 조건은 바뀔 수 있어요 (수업 전 확인).

---

## 10. Claude Code에게 이렇게 부탁하면 이 코드를 직접 만들 수 있어요

빈 폴더에서 Claude Code를 열고 아래를 그대로 붙여 넣어 보세요.

```text
Cloudflare Workers + TypeScript로 꽃집 「봄날의 꽃」의 LINE 상담 봇을 만들어 줘.
초보자가 읽을 코드라서 작고 읽기 쉽게, 한국어 주석을 자세히 달아 줘.

[경로]
- POST /line/webhook: x-line-signature를 채널 시크릿으로 HMAC-SHA256(base64) 검증(Web Crypto, 상수 시간 비교).
  검증 후 즉시 200을 돌려주고 ctx.waitUntil로 처리. 텍스트 메시지면 로딩 애니메이션 API 호출 →
  Claude 호출 → Reply API로 답장. 친구 추가(follow)엔 AI 상담원 고지 인사, 스티커·사진엔 정중한 안내.
- POST /kakao/skill: userRequest.utterance/callbackUrl 사용. callbackUrl이 있으면
  {version:"2.0", useCallback:true, data:{text:"답변을 준비하고 있어요..."}}로 즉시 응답하고
  나중에 callbackUrl로 최종 스킬 응답을 POST. 없으면 4초 안에 답하고, 늦으면 안내 문구.
- GET /: 작동 확인 글.

[Claude]
- fetch로 https://api.anthropic.com/v1/messages 호출 (x-api-key, anthropic-version: 2023-06-01),
  모델 claude-haiku-4-5. system 블록에 cache_control ephemeral.
- system 프롬프트는 src/knowledge.ts에 따로 두기: 손님 언어(한국어/일본어)로 답, 첫 인사 시 AI 고지,
  환불·보상 약속 금지, FAQ에 없으면 needs_human, 카드·주민번호 묻지 않기 + 가게 FAQ.
- JSON {answer, category, needs_human}으로 받기(category: 영업정보|주문|배송|환불|불만|기타).
  직접 만든 검사 함수로 확인하고, 깨지면 needs_human=true + 한·일 사과 문구로 대체.

[개인정보·직원 연결]
- 전화번호·카드번호·주민번호·이메일을 가린 뒤에만 Claude/Slack/Jira로 보내기.
- needs_human이거나 환불·불만이면: Jira REST v3로 이슈 생성(Basic 인증, 프로젝트 키 환경변수,
  유형은 환불·불만=클레임, 나머지=문의, 설명은 ADF) → 이슈 키를 넣어 Slack Incoming Webhook 알림.
  실패해도 손님 답장은 막지 말고 로그만 남기기.

[환경변수] ANTHROPIC_API_KEY, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SLACK_WEBHOOK_URL,
JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, KAKAO_SKILL_SECRET(카카오 URL ?key= 와 비교). 요청 때 빠진 값은 이름을 로그에 남기기.

[품질] 함수는 50줄 이하, 파일은 300줄 이하, 원본을 바꾸지 않는 방식.
vitest로 테스트를 먼저 쓰고(fetch는 가짜로 대체) 커버리지 80% 이상, tsc --noEmit 통과.
wrangler.toml(name "bomnal-bot"), .dev.vars.example, 초보자용 한국어 README도 만들어 줘.
```

> Claude Code가 만든 코드도 **반드시 `npm test`와 실제 LINE 테스트**로 확인하세요. AI가 만든 코드도 검토가 필요합니다.
