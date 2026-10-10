# 수업용 Claude 스킬 예제

> 2026-10 기준. claude.ai 메뉴 이름은 자주 바뀌므로 수업 전 강사가 실제 화면을 확인하세요.
>
> 공지문 스킬의 "광고 표현 금지 체크리스트"는 의료법·표시광고법·화장품법의 취지를 쉽게 정리한 수업용 자료입니다. 법률 자문이 아니므로 수업 전 최신 규정을 확인하세요.

| 폴더 | 무엇을 하나요 | 사용 회차 |
|---|---|---|
| `bomnal-notice-writer/` | 「봄날 에스테틱」 공지문(휴무·이벤트·가격 변경·예약 안내)을 브랜드 말투로 작성 + 광고 표현(치료·완치·시술 등) 점검 + LINE 일본어 버전 | 3회차, 5회차, 부록 E |
| `bomnal-weekly-report/` | Jira BOM 이슈로 예약·노쇼·클레임·다음 주 예약 현황을 담은 주간 보고 작성 | 11회차 |

## 스킬 폴더 구조

```
bomnal-notice-writer/          ← 폴더 이름 = SKILL.md 의 name 과 같게
├── SKILL.md                   ← 필수. 맨 위에 name, description
└── references/
    └── shop-facts.md          ← 선택. SKILL.md 가 필요할 때 꺼내 보는 참고 자료
```

`SKILL.md` 맨 위 머리말(YAML frontmatter) 규칙:

- `name`: 영어 소문자·숫자·하이픈(-)만, 64자 이내. "claude", "anthropic" 이라는 단어는 쓸 수 없음.
- `description`: 무엇을 하는지 + **언제 써야 하는지**. claude.ai 도움말 기준 200자 이내로 짧게 (API 문서 상한은 1,024자).

## .zip 으로 묶는 법 (가장 중요)

claude.ai 는 **스킬 폴더가 zip 의 맨 바깥(루트)에 있어야** 받아 줍니다.
`SKILL.md` 파일만 따로 압축하면 안 됩니다.

```
✅ 올바름                         ❌ 틀림
bomnal-notice-writer.zip          bomnal-notice-writer.zip
└── bomnal-notice-writer/         ├── SKILL.md          ← 폴더 없이 파일만
    ├── SKILL.md                  └── references/
    └── references/
```

- **Mac**: Finder 에서 `bomnal-notice-writer` **폴더**를 오른쪽 클릭 → **"압축"** → 같은 위치에 `bomnal-notice-writer.zip` 생성
- **Windows 11**: 폴더를 오른쪽 클릭 → **"ZIP 파일로 압축"** (Windows 10: **보내기 → 압축(ZIP) 폴더**)
- **터미널** (zip 이 설치된 경우):
  ```bash
  cd examples/skills
  zip -r bomnal-notice-writer.zip bomnal-notice-writer -x "*.DS_Store"
  ```

이 폴더에는 강사용으로 미리 묶어 둔 `bomnal-notice-writer.zip`, `bomnal-weekly-report.zip` 도 있습니다. SKILL.md 를 고쳤다면 zip 을 다시 만드세요.

## claude.ai 에 올리는 법 (2026-10 기준, 수업 전 확인)

1. **Settings(설정) → Capabilities(기능)** 에서 **Code execution and file creation(코드 실행 및 파일 생성)** 켜기 — 스킬은 이 기능 위에서 동작합니다.
   - Team/Enterprise: 관리자가 **Organization settings(조직 설정)** 에서 코드 실행과 Skills 를 먼저 허용해야 합니다.
2. **Customize(사용자 지정) → Skills(스킬)** 로 이동
3. **+** → **Create skill(스킬 만들기)** → **Upload a skill(스킬 업로드)** → zip 선택
4. 목록에 `bomnal-notice-writer` 가 보이고 토글이 켜져 있으면 성공
5. 새 채팅에서 "추석 휴무 공지 써줘" → Claude 가 스킬을 읽는 표시가 나오는지 확인

끄기: 같은 화면에서 토글 끄기 / 삭제: 스킬 상세 → **⋯** → **Delete(삭제)**

## Claude Code 에서 쓰는 법

zip 이 필요 없습니다. 폴더를 그대로 복사하면 됩니다.

```bash
# 내 컴퓨터 전체에서 사용 (개인)
cp -r bomnal-notice-writer ~/.claude/skills/

# 이 프로젝트에서만 사용 (팀과 git 으로 공유 가능)
mkdir -p .claude/skills && cp -r bomnal-notice-writer .claude/skills/
```

Claude Code 에서 `/bomnal-notice-writer 추석 휴무 공지` 처럼 직접 부르거나, 그냥 "공지문 써줘"라고 하면 알아서 꺼내 씁니다.

## 보안 주의

스킬에는 Claude 가 따를 **지시문과 실행 코드**가 들어갈 수 있습니다. 직접 만들었거나 Anthropic 등 믿을 수 있는 곳에서 받은 스킬만 설치하고, 남이 준 스킬은 SKILL.md 와 모든 파일을 먼저 열어 읽어 보세요. 스킬 안에 비밀번호·API 키를 적지 마세요.

## 출처

- https://support.claude.com/en/articles/12512180-using-skills-in-claude
- https://support.claude.com/en/articles/12512198-how-to-create-custom-skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://code.claude.com/docs/en/skills
- https://github.com/anthropics/skills
