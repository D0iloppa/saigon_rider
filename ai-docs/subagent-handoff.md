# 서브에이전트 QM 루프 — 핸드오프

> 화면별 품질 점검을 **구현자(qm-implementer) → 독립 검토자(qm-reviewer)** 2-에이전트 루프로 자동화한다.
> 드라이버(메인 세션)가 화면을 순회하고, 사람 개입은 `DECISION_NEEDED` 게이트에서만 일어난다.

## 구성물 (이미 생성됨)

| 파일 | 역할 |
|---|---|
| `scripts/qm_loop_init.sh` | 스캐폴더 — 아래 3개 파일을 생성(비파괴, `--force`로 덮어쓰기) |
| `.claude/agents/qm-implementer.md` | 구현·자가검증·커밋 서브에이전트 (`Read/Edit/Write/Bash/Grep/Glob`) |
| `.claude/agents/qm-reviewer.md` | read-only 독립검토, `PASS/CHANGES/DECISION_NEEDED` 판정 (`Read/Grep/Glob/Bash`) |
| `_relay_screens.md` | 화면별 진행 보드 — 단일 진실원천이자 재개 지점. QM_TASK·화면 목록·상태/라운드/판정 |
| `scripts/qm_loop_driver_prompt.md` | 메인 세션에 붙여넣는 드라이버 프롬프트 |

## 루프 구조

```
메인 세션(드라이버) — _relay_screens.md 의 PENDING 을 위→아래 순회:
  qm-implementer  구현·자가검증·커밋
        ↓
  qm-reviewer     read-only 독립검토 (git diff 가 근거, 구현자 보고를 신뢰하지 않음)
        ↓
  PASS            → 보드에 기록 → 다음 화면
  CHANGES (≤4회)  → 수정요구를 implementer 에 환류 (같은 화면)
  CHANGES (==4회) → DECISION_NEEDED 로 자동 격상
  DECISION_NEEDED → 루프 정지 → 대표 게이트 (유일한 사람 개입 지점)
```

## ⚠️ 중요 — 커스텀 에이전트는 세션 시작 시점에만 등록됨

Claude Code 는 `.claude/agents/*.md` 를 **세션 시작 시 한 번** 읽어 등록한다.
세션 *도중* 새로 만든 에이전트는 그 세션에서 `subagent_type` 으로 잡히지 않는다
(`Agent type 'qm-implementer' not found`). → **반드시 새 세션에서 실행한다.**

## ⚠️ 중요 — 루프는 세션이 살아있는 동안만 작동

서브에이전트는 독립 데몬이 아니라 세션 프로세스 안에서 돈다.
- 세션을 닫으면 **정지**한다 (서브에이전트가 따로 계속 돌지 않음).
- 재개는 자동이 아니다 — 새 세션에서 드라이버 프롬프트를 다시 붙여넣어야 한다.
- 단, `_relay_screens.md`(상태) + git 커밋(완료분)이 체크포인트이므로 **PENDING 부터 이어서** 갈 수 있다.
- 사람 없이 정해진 시각에 도는 것은 별개 영역(`/schedule` 원격 cron)이다.

## 실행 절차 — 대표가 할 일 (3스텝)

**1. 새 세션 시작**
같은 디렉토리(`/mnt/c/DEV/saigon_rider`)에서 `claude` 재실행, 또는 앱에서 새 대화.
→ 시작 시 `qm-implementer`/`qm-reviewer` 자동 등록.

**2. 등록 확인 (선택)** — 새 세션에서 `/agents` → 목록에 두 에이전트가 보이면 OK.

**3. 루프 시동** — 새 세션에 붙여넣기:
```
scripts/qm_loop_driver_prompt.md 의 내용대로 QM 루프 드라이버를 시작해줘.
QM_TASK 와 화면 목록은 이미 _relay_screens.md 에 세팅돼 있으니 그걸 따른다.
```
> 또는 `scripts/qm_loop_driver_prompt.md` 본문 블록을 통째로 붙여넣어도 된다.

## 진행 조회

- 터미널 트랜스크립트에 서브에이전트 작업이 실시간 스트리밍 (`Ctrl+O` 로 상세 펼치기).
- 영속 상태: `cat _relay_screens.md` (상태/라운드/판정/로그), `git log --oneline` (커밋된 결과물).
- 백그라운드/`Workflow` 로 돌릴 경우 `/workflows`, `TaskList`/`TaskGet`/`TaskOutput` 로 조회.

## 새 패스를 돌릴 때

1. `_relay_screens.md` 의 `QM_TASK` 를 새 과업으로, 화면 목록을 대상 화면으로 교체(상태 `PENDING`, 라운드 `0`).
2. 새 세션에서 위 3번으로 시동.
