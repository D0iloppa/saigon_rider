# SRE Upgrade — 스레드별 작업 가이드

> 태스크 원본: `ai-docs/task/active/260518_sre_upgrade_plan_task.md`

---

## 공통 원칙

```
ai-docs/task/active/260518_sre_upgrade_plan_task.md 읽고
{SUB-X} 진행해줘.
완료 항목은 체크박스 갱신하고 __DEV 상태도 함께 전환.
```

---

## 서브태스크별 시작 프롬프트

**SUB-2 — DB 마이그레이션**
```
260518_sre_upgrade_plan_task.md + _tmp/sre-upgrade/sre-gamification-deployment-guide.md §2 읽고
SUB-2 진행. engine/alembic/versions/001_sre_enums.py 패턴 참고해서 011~016 리비전 생성.
```

**SUB-2.5 — Skywork 자산 통합**
```
260518_sre_upgrade_plan_task.md SUB-2.5 읽고 13단계 순서대로 진행.
appendix 경로 매핑표 참고. frontend/ 구조 확인 후 착수.
```

**SUB-3 — Engine 서비스 + BFF**
```
260518_sre_upgrade_plan_task.md SUB-3 읽고 진행.
engine/app/models.py, schemas.py, engine_client.py 먼저 읽어서 기존 패턴 파악 후 착수.
SUB-2 완료 확인 필수.
```

**SUB-4 STEP D — 화면 구현**
```
260518_sre_upgrade_plan_task.md SUB-4 읽고 STEP D 진행.
screens_v3_rpg.html 참고. SUB-2.5 + SUB-3 완료 확인 후 착수.
D-1(가챠) → D-3(상점) → D-5(인벤토리) 순.
```

**SUB-6 — 어드민**
```
260518_sre_upgrade_plan_task.md SUB-6 읽고 진행.
backend/app/routers/admin.py 패턴 참고.
```

---

## 스레드 분리 순서

```
스레드 1: SUB-2  ──┐
스레드 2: SUB-2.5 ┘ 병행 가능

스레드 3: SUB-3        ← SUB-2 완료 후
스레드 4: SUB-4 STEP D ← SUB-2.5 + SUB-3 완료 후
스레드 5: SUB-6        ← SUB-3과 병행 가능
```

---

## 모델 선택

| 서브태스크 | 추천 모델 |
|---|---|
| SUB-2 | Sonnet 4.6 |
| SUB-2.5 | Sonnet 4.6 |
| SUB-3 | **Opus 4.7** |
| SUB-4 STEP D | Sonnet 4.6 |
| SUB-6 | Sonnet 4.6 |

SUB-3만 Opus — 나머지는 Sonnet으로 비용/속도 균형.
