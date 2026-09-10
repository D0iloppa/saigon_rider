# qm_recall 이식 가이드 — 다른 PC·다른 프로젝트에 기록 자동 소환 붙이기

> 이 문서 하나로 **처음 보는 PC의 Claude Code가 스스로 설치·검증**할 수 있게 썼다.
> 정본 코드 = `scripts/hooks/qm_recall.py` (querymind 레포, git이 지킨다) · 버전 1.0.0 · stdlib 전용.

---

## 1. 한 줄 요약

**매 질문마다, 그리고 파일을 고치기 직전마다, 그 일과 관련된 과거 기록 3줄을 원문 그대로 컨텍스트에 밀어 넣는 hook.**
Claude가 "찾아야 할 것이 있는 줄" 몰라서 같은 실수를 반복하는 것을 막는다.

## 2. 왜 필요한가 (이 도구가 생긴 사고)
핵심은 이것이다 — **게으름이 아니라 찾아야 할 것이 있는 줄 몰랐기 때문**이다. 그래서 "기록을 찾아라"는 규칙을 아무리 늘려도 소용이 없었다. 기존 장치 셋이 모두 실패한 이유가 각각 다르다.

| 기존 장치 | 왜 못 막았나 |
|---|---|
| 세션 시작 1회 주입(SessionStart) | 그 **뒤에 오는 질문**을 못 본다 |
| 코드 그래프(codebase-memory MCP) | 주석 속 결정("바꾸지 마라")과 **한국어 md를 못 찾는다**(실측) |
| 헌법에 "기록을 먼저 읽어라" 조항 | 읽어야 할 게 **있는지 모르면** 발동하지 않는다 |

그래서 **내 판단과 무관하게, 자동으로, 매 질문마다** 돌게 만들었다.

## 3. 설치 — 새 PC에서 1회

### 3-1. querymind 레포가 있는 PC (권장)

```bash
python scripts/hooks/install_qm_recall.py          # 설치 (멱등 — 여러 번 돌려도 hook이 중복되지 않는다)
python scripts/hooks/install_qm_recall.py --check  # 설치 상태만 확인
```

이 스크립트가 하는 일(전부 멱등 · 기존 파일은 백업 후 교체):

1. `scripts/hooks/qm_recall.py`(정본) → `~/.claude/hooks/qm_recall.py`(사본) 복사
2. `~/.claude/settings.json`에 hook 두 개 등록(이미 있으면 건너뜀)
3. 스모크 — 현재 레포에서 prompt 이벤트를 1회 실행해 소환 블록이 나오는지 확인

### 3-2. querymind 레포가 없는 PC

`qm_recall.py` 파일 하나만 있으면 된다(stdlib 전용 · 외부 의존성 0).

1. `scripts/hooks/qm_recall.py`를 그 PC의 `~/.claude/hooks/qm_recall.py`로 복사
2. `~/.claude/settings.json`의 `hooks`에 아래 두 항목을 추가(경로는 그 PC에 맞게)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command",
                     "command": "python \"C:\\Users\\<사용자>\\.claude\\hooks\\qm_recall.py\" --event prompt",
                     "timeout": 20 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit",
        "hooks": [ { "type": "command",
                     "command": "python \"C:\\Users\\<사용자>\\.claude\\hooks\\qm_recall.py\" --event pretool",
                     "timeout": 20 } ] }
    ]
  }
}
```

> `hooks` 블록이 이미 있으면 **배열에 항목을 추가**한다. 블록을 통째로 덮어쓰면 다른 hook이 사라진다.

### 3-3. 설치 후 확인 (필수)

새 세션을 열고 아무 질문이나 던졌을 때 `=== 기록 소환 qm_recall …` 블록이 뜨면 성공이다.
**눈으로 확인하라** — "장치가 있다"와 "장치가 돈다"는 다르다. 이 프로젝트에서 실제로, 스크립트는 멀쩡한데 **아무도 부르지 않는 상태**로 방치된 hook이 있었다.

## 4. 어떻게 도는가

| 시점 | 무엇을 주입하나 |
|---|---|
| **질문할 때마다**(UserPromptSubmit) | 질문과 관련된 기존 기록 **상위 3줄을 원문 그대로** |
| **파일을 고치기 직전**(PreToolUse: Edit/Write/MultiEdit) | 그 파일 안의 **★ 경고**와 관련 기록 |

색인 대상은 두 곳이고 **둘 다** 본다.

- 레포의 `.agent_memory/`
- Claude 자동 메모리 `~/.claude/projects/<slug>/memory/`

둘 다 없는 프로젝트에서는 **무출력 · 토큰 0**이다. 그래서 전역에 걸어도 안전하다.

### 설계 원칙 — 실측이 정한 것 (바꾸기 전에 읽어라)

1. **어휘 단계만 항상 돈다(0.4초 · 비용 0).** 코퍼스를 통째로 LLM에 주면 **34초 · $0.24/콜**이라 매 턴 불가능하다. 1단계 어휘 필터로 후보 25줄을 추리고, LLM 단계는 `QM_RECALL_LLM=1`일 때만 켠다(`claude -p` 왕복 7.5초).
2. **LLM은 고르기만 하고, 출력은 인덱스 원문 그대로.** 요약을 시켰더니 실측에서 **출처를 오귀속(1건)**하고 **정반대로 오도(1건)**했다("2개 DB 동시 연결 완결" — 실제와 반대). 요약하는 순간 거기서 환각이 들어온다.
3. **실패는 조용히 흡수한다.** 이 도구가 사용자의 질문을 막거나 지연시키면 그 자체가 사고다.
4. **중첩 호출 차단.** `QM_RECALL_NESTED=1`이면 즉시 종료한다(2단계가 띄우는 `claude -p`가 자기 hook을 다시 불러 무한 재귀에 빠지는 것을 막는다).

## 5. ★ 기억 저장 규약 — 소환 품질은 저장 품질이 결정한다

이 도구는 **어휘로 찾는다.** 그래서 기록을 어떻게 쓰느냐가 곧 재현율이다.

- **파일 하나에 사실 하나.** 여러 사실을 한 파일에 담으면 어느 것도 정확히 안 걸린다.
- **앞머리에 `description:` 한 줄** — 가중치 ×2로 색인된다. 여기에 핵심 어휘를 넣는다.
- **인덱스에 한 줄** — `- [제목](파일명.md) — 한 줄 요약` 형식.
- **결정·경고에는 ★를 붙인다** — **★가 붙은 줄만 색인된다.** 코드에서는 `T_` 마커 줄도 함께 색인된다.
- 새 레포 골격 만들기: `python ~/.claude/hooks/qm_recall.py --event init`

## 6. ★★ 사용 규칙 — 주입된 블록에는 반드시 답한다

`=== 기록 소환 qm_recall … ===` 블록이 뜨면 **각 건을 "확인"(읽고 반영했다) 또는 "무관"(왜 무관한지 한 마디)으로 답한 뒤** 작업을 시작한다.

건너뛰고 착수하면 그것이 곧 규칙 위반이다. **3줄이라 비용은 미미하다.**

이 규칙은 도구가 아니라 사람이 쓰는 헌법에 둔다(전역 `CLAUDE.md`). 설치 스크립트는 이 항목을 건드리지 않으므로, 이식할 때 **그 PC의 `CLAUDE.md`에도 이 조항을 같이 옮겨야** 실효가 있다.

## 7. 검증 — 회귀 세트

```bash
python ~/.claude/hooks/qm_recall.py --event test --no-llm   # 권장 — 약 1초
```

> **`--no-llm`을 반드시 붙여라.** 실측(2026-08-30): `--no-llm`이면 **1초**에 끝나지만, 빼면 케이스마다
> `claude -p`를 왕복해 **120초 타임아웃**이 난다. 다른 PC에서 "멈췄다"고 오해하기 쉬운 지점이다.
> 그리고 hook이 실제로 도는 것은 어휘 단계이므로, **`--no-llm`이 운영 형상과 같은 조건**이다.

기대 출력은 이런 형태다(케이스별 PASS/GAP + 소환된 파일 경로).

```
[PASS] case1_... (lexical) → ['.agent_memory/INDEX_ARCHIVE.md:66', ...]
[GAP ] case3_... (lexical) → [...]
       expected one of: [...]
RESULT 5/5 passed · known_gap=1
```

`known_gap`은 **의도적으로 남겨둔 미해결 케이스**다(8절의 한계에 해당하는 부류). 0이 아니라고 고장이 아니다.

회귀 세트 = `<repo>/.agent_memory/recall_cases.json`.

**사고가 나면 그 사고를 케이스로 추가한다.** 이것이 이 장치의 골든셋이다 — "이 질문에서 이 기록이 소환됐어야 한다"를 케이스로 고정하면 다음 개선이 그것을 깨뜨리지 못한다.

## 8. 한계 — 만능이라고 믿지 마라

이 장치가 잡는 것은 **"몰라서 못 찾은 것"**뿐이다.

지시문이나 파일에 **단서가 아예 없는** 부류는 못 잡는다. 실측 사고 5건 중 4건은 이 도구가 잡았지만, 나머지 1건(골든셋의 `expect` 값이 제품 계약과 반대로 적혀 있던 것)은 질문에 단서가 없어 소환이 불가능했다. **그 부류의 처방은 계약 테스트다.**

또 하나 — 어휘 기반이라 **표현이 완전히 다르면 못 찾는다.** 그래서 5절의 저장 규약(핵심 어휘를 `description`에 넣기)이 중요하다.

## 9. 명령 레퍼런스

```bash
python qm_recall.py --event prompt          # hook용 — 질문 관련 기록 주입
python qm_recall.py --event pretool         # hook용 — 편집 대상 파일의 ★ 경고 주입
python qm_recall.py --event query "질문"     # 수동 — 이 질문에 무엇이 소환되는지 확인
python qm_recall.py --event build [--root DIR]  # 색인 재생성
python qm_recall.py --event test --no-llm   # 회귀 세트(--no-llm 필수 · 안 주면 타임아웃)
python qm_recall.py --event init            # 새 레포에 기억 폴더 골격 생성
```

옵션: `--root DIR`(대상 레포 지정) · `--no-llm`(2단계 LLM 강제 비활성)
환경변수: `QM_RECALL_LLM=1`(2단계 LLM 켜기) · `QM_RECALL_NESTED=1`(재귀 차단용 · 내부 사용)

## 10. 파일 목록

| 파일 | 역할 |
|---|---|
| `scripts/hooks/qm_recall.py` | **정본**(git이 지킨다) · 약 27KB · stdlib 전용 |
| `~/.claude/hooks/qm_recall.py` | 사본(설치 스크립트가 복사) |
| `scripts/hooks/install_qm_recall.py` | 설치·검증(멱등) |
| `~/.claude/settings.json` | hook 배선(UserPromptSubmit · PreToolUse) |
| `<repo>/.agent_memory/` | 색인 대상 기억 폴더 |
| `<repo>/.agent_memory/recall_cases.json` | 회귀 세트 |

> **정본을 전역(`~/.claude`)에 두지 마라.** 전역 설정은 다른 PC로 clone할 때 따라가지 않고, 이 프로젝트에서 실제로 한 번 사라진 전력이 있다. git이 지키는 자리에 두고 설치 스크립트로 배포한다.
