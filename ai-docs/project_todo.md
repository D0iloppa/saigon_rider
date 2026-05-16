# 프로젝트 TODO 리스트

> 영역(프론트엔드 / BFF / Engine / DB / 인프라) 을 가로지르거나, 임시·데모 코드를 정식 흐름으로 승격해야 하는 후속 구현 항목.
>
> **운영 규칙**: 등록·착수·완료(아카이브)·보류의 모든 절차는 [`workflow/project-todo-management.md`](workflow/project-todo-management.md) 단일 워크플로우 문서를 따른다.
>
> **상태 범례**: ⬜ 미착수 · 🚧 진행중 · ⏸ 보류 (✅ 완료 항목은 본 파일에 남기지 않는다 — 즉시 [`task/archive.md`](task/archive.md) 로 이관)

---

## 🎯 퀘스트 / 미션 완료 플로우

### ⬜ [DBG] 버튼 → 정식 퀘스트 완료 트리거 연결

**현 상태 (2026-05-16)**
- `frontend/src/pages/quest/QuestDetail.tsx` 우하단 `[DBG]` 버튼이 `completeQuest(questId, userId, passcode)` 를 직접 호출 → BFF 퀘스트 완료 처리 + EXP/Gold 보상 지급을 데모용으로 노출 중.
- 본 버튼은 **퀘스트 완료 시 미션 COMPLETE 처리 / 보상 지급 파이프라인이 동작함을 확인하기 위한 임시 UI**.

**정식 구현 시 필요한 작업**

| 영역 | 항목 |
|---|---|
| Frontend | 라이딩 종료(`RideResult`) 시점에 활성 퀘스트의 조건(거리·시간대·안전등급) 충족 여부 평가 → 자동으로 완료 API 호출 |
| Frontend | 퀘스트 진행 중(`RideActive`) 실시간 조건 미달 안내 (예: 안전등급 하락 시 경고) |
| Frontend | `QuestDetail` 의 `[DBG]` 버튼 / `dbgBtn` 스타일 / `handleDbgComplete` / DBG AlertDialog 일괄 제거 |
| BFF | `POST /api/quests/{id}/complete` 의 조건 검증 강화 (현재 단순 호출만으로 완료 처리되는지 점검) |
| Engine | `QUEST_COMPLETE` 이벤트 수신 → 미션 진행도 / RP 지급 / 일일 cap 적용 확인 |
| QA | 자동 완료 시 토스트·뱃지·HUD 갱신 회귀 점검 |

**참조 코드**
- `frontend/src/pages/quest/QuestDetail.tsx:71-89, 180-185`
- `frontend/src/pages/quest/QuestDetail.module.css:157-` (`.dbgBtn`, DBG AlertDialog 스타일)
- `frontend/src/api/quests.ts` — `completeQuest()`

---

## 📝 피드 / 콘텐츠

### ⬜ 스토리 등록 UI
- BFF 측 `is_story=true` 플래그는 존재. 프론트 UI 부재.
- 필요: 피드 작성 모달에서 "스토리로 게시" 토글 + 24h 만료 표시.

### ⬜ 피드 게시물 작성 UI
- 현재 라이딩 결과(`RideResult`) 에서만 자동 생성. 일반 작성 진입점 없음.
- 필요: 탭바 FAB → 작성 화면 / 이미지 업로드 / 위치·해시태그 연동.

---

## 🤝 소셜 / 리퍼럴

### ⬜ 친구 초대 / REFERRAL 이벤트 트리거
- Engine 측 `REFERRAL` 액션 매핑 존재. BFF 측 트리거 미구현.
- 필요: 초대 링크 생성 API · 가입 시 추천인 매칭 · BFF → Engine `REFERRAL` 이벤트 발행.

---

## 🛠 관리자 / 운영

### ⬜ 어드민 퀘스트 생성 시 `thumbnail_content_id` 연결 플로우
- 현재 DB 의 실제 퀘스트는 `thumbnail_content_id` 가 비어 있어 district 이미지 → mock 으로 폴백.
- 필요: 어드민 콘솔에서 퀘스트 생성/수정 시 컨텐츠 업로드 + `thumbnail_content_id` 연결 UI.

---

## 🔐 인증 / 보안

### ⏸ passcode 평문 쿠키 → HttpOnly + JWT 전환
- 현재 `frontend/src/lib/session.ts` 가 passcode 를 평문 쿠키에 저장.
- 정식 출시 전 HttpOnly 쿠키 + 서버 발급 JWT 로 교체 필요. (README 인증 구조 섹션의 보안 참고 참조)

---

---

> 항목 추가·착수·완료 아카이빙 절차는 [`workflow/project-todo-management.md`](workflow/project-todo-management.md) 참조.
