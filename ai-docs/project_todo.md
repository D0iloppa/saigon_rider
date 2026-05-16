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
- 참고: 피드 작성 UI(`/feed/new`)는 12차에서 구현됨. 스토리 토글만 추가하면 됨.


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

## 🗺 위치 / 지도

### ⬜ 퀘스트 페이지 핀 버튼 → "내 근처 퀘스트" 필터

**현 상태 (2026-05-16)**
- `frontend/src/pages/quest/QuestList.tsx:100` 헤더 우측에 `<GifIcon code="1f4cd" size={32} />` 핀 이모지 아이콘 배치되어 있으나 **onClick 핸들러 없음 — 장식 상태**.
- 퀘스트 목록 API (`fetchQuests`) 는 `districtId / riderTypeId / safetyGradeId` 만 필터로 받음. 좌표·반경 파라미터 없음.
- District 모델은 `code / name_* / image_* / sort_order / is_active` 만 보유 — **중심 좌표 없음**.

**UX 의도 (확정)**
- 핀 토글 ON: 사용자의 현재 위치 기준 근처 퀘스트만 노출.
- 좌표가 NULL 인 퀘스트(이벤트성·위치 무관)는 거리 조건과 상관없이 항상 노출.
- 핀 토글 OFF: 기존 카테고리 필터(`district / riderType / safetyGrade`) 만 적용.

**이미 존재하는 자산 (재활용 권장)**

| 자산 | 위치 | 비고 |
|---|---|---|
| `quest_pins` 테이블 | `database/init/001_init_schema.sql:115-119` | `location GEOMETRY(POINT, 4326)` 보유, 1 quest : N pins 가능 |
| `GET /api/quests/pins` | `backend/app/routers/quests.py:124-132` | 모든 핀의 (lat, lng) 반환 — 월드맵용 |
| `nativeInterface.getLocation` | `frontend/src/lib/native.ts:56`, 사용 예시 `WorldMap.tsx:63` | WebView ↔ Native 위치 1회 조회 브릿지 |
| PostGIS 3.3 | `001_init_schema.sql:7` (`CREATE EXTENSION postgis`) | `ST_DWithin` 등 즉시 사용 가능 |

**데이터 모델 결정 사항 (착수 시 확정)**

- (A) **권장**: `quest_pins.location` 만 활용 → 퀘스트당 1+ 좌표 지원, district 에는 별도 컬럼 추가 안 함. 단, "퀘스트 중심점" 이 의미 있는 시나리오면 district 에 `center_location GEOGRAPHY(POINT, 4326)` 추가 검토.
- (B) 사용자 가설 원안: `districts.center_location` 추가 + `quests.location` 도 추가. → 단점: `quest_pins` 와 좌표 중복 (single-source-of-truth 깨짐).
- (C) `districts.center_location` 만 추가하고, 퀘스트 좌표는 `quest_pins` 사용. district 좌표는 폴백/지도 줌 기준점 용도.

**정식 구현 시 필요한 작업**

| 영역 | 항목 |
|---|---|
| Frontend | `QuestList` 핀 아이콘에 `onClick` 부착 → 토글 상태(active 시각 표시), `nativeInterface.request(GET_LOCATION)` 호출 |
| Frontend | 위치 권한 거부 / 실패 시 토스트 + 토글 OFF 폴백 |
| Frontend | `fetchQuests` 호출 시 `lat / lng / radiusM` 파라미터 전달 (토글 ON 일 때만) |
| Frontend | i18n 키 추가 (위치 권한 안내, 결과 0개 안내 등) |
| BFF | `GET /api/quests` 에 `lat / lng / radiusM` 쿼리 파라미터 추가, 기본 반경(예: 3 km) `app_config` 로 노출 |
| BFF | `ST_DWithin(qp.location::geography, ST_MakePoint(lng, lat)::geography, radiusM)` 기반 join — `quest_pins` 가 없는 퀘스트는 거리 조건 무시(LEFT JOIN + COALESCE) |
| DB | 위 데이터 모델 결정에 따라 마이그레이션 작성 (예: `015_district_center_location.sql`) |
| DB | `quest_pins.location` 의 GiST 인덱스 존재 여부 점검 (없으면 추가) |
| QA | 위치 권한 ON/OFF, 반경 경계, 좌표 NULL 퀘스트 노출, 카테고리 필터와의 AND 조합 회귀 점검 |

**참조 코드**
- `frontend/src/pages/quest/QuestList.tsx:48-89` (`fetchQuests` 호출), `:100` (핀 이모지)
- `frontend/src/api/quests.ts` (`fetchQuests` 시그니처)
- `frontend/src/lib/native.ts:56` (`NATIVE_KEYS.GET_LOCATION`), `WorldMap.tsx:63` (사용 예시)
- `backend/app/routers/quests.py` (`fetchQuests` 핸들러, `/pins` 엔드포인트)
- `database/init/001_init_schema.sql:115-119` (`quest_pins` 정의)

---

## 🔐 인증 / 보안

### ⏸ passcode 평문 쿠키 → HttpOnly + JWT 전환
- 현재 `frontend/src/lib/session.ts` 가 passcode 를 평문 쿠키에 저장.
- 정식 출시 전 HttpOnly 쿠키 + 서버 발급 JWT 로 교체 필요. (README 인증 구조 섹션의 보안 참고 참조)

---

---

> 항목 추가·착수·완료 아카이빙 절차는 [`workflow/project-todo-management.md`](workflow/project-todo-management.md) 참조.
