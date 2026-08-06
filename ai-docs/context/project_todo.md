# 프로젝트 TODO 리스트

> 영역(프론트엔드 / BFF / Engine / DB / 인프라) 을 가로지르거나, 임시·데모 코드를 정식 흐름으로 승격해야 하는 후속 구현 항목.
>
> **상태 범례**: ⬜ 미착수 · 🚧 진행중 · ⏸ 보류 (✅ 완료 항목은 즉시 제거)
> **추적 SoT**: `__DEV_todos` DB. 이 파일은 DB에 담기 어려운 **다영역 상세 스펙**을 보관한다.

---

## 🗺 업체 위치 지오코딩 (주소 ↔ 좌표 양방향)

### ⏸ 주소 입력→자동 핀 / 핀→주소 출력 — 대표 보류 (2026-08-03)

**요구 (대표 실사용 피드백)**
> "업체 위치 선택이 불편하다. ①주소를 입력하면 자동으로 pin 찍어주는 기능 ②pin 을 찍으면 주소가 출력되는 기능, 이 두 가지가 부재해서 불편하다."

대상: `frontend/src/pages/biz/BizLocationPicker.tsx`(업체등록 「가게 위치 선택」 시트). 현재 하단 표시는 `resolveDistrict()` 의 **동(ward) 이름뿐**이고, 지도가 벤탄 기본 좌표에서 시작해 **호치민 전역을 손으로 팬·줌해야** 자기 가게를 찾는다.

**보류 사유**: 외부 지오코딩 공급자 계약이 필요하고 비용·계정 결정이 대표 소관. 출시 이후로 미룸.

**🔴 UX 방향은 확정됐다 (대표 결정 2026-08-03)** — **도로명 자동 채움 + 번지는 사용자 수동 입력.** `BizApply` 의 기존 "상세 주소(선택)" 자유텍스트 필드를 그대로 쓰면 되므로 변경 폭이 작다. 아래 §번지 근거 참조.

#### 조사 결과 (2026-08-03, 재조사 비용이 크니 그대로 재사용할 것)

| 확인 항목 | 결과 |
|---|---|
| 내부 데이터로 해결 가능? | **불가.** `poi` 테이블 **98건**뿐. 등록자가 검색할 임의 신규 주소가 여기 있을 확률은 사실상 0. `search_blob`+`pg_trgm` 검색 인프라도 이 98건 대상이라 동일 한계 |
| 기존 Google 키 재사용? | `app_config` `group_name='google', key='map'` 1건(39자, `AIza...` 포맷) — **Directions API 전용으로 제한 발급**됨(`ai-docs/google-maps-api-key-setup.md`). Geocoding/Places 는 **추가 Enable + 키 제한 완화 필요** |
| 결제 리스크 | 같은 Google 프로젝트면 **2026-08-02 결제계정 종료로 번역 API 3주 403** 났던 그 계정에 묶인다(ADR 참조). Directions 와 장애 도메인이 결합된다 |
| 지도 스택에 딸려오나? | 아니다. `OsmMap.tsx` 는 MapLibre GL + OpenFreeMap **타일만** — 타일과 지오코딩은 별개 계약 |
| Nominatim 공개서버 | **정책상 "Auto-complete search" 명시적 금지** + 1req/s + 상업 서비스의 주기능이면 자체 서버 요구(정책 문서 직접 확인). "주소 입력→자동 핀" 의 핵심 UX 가 위반이라 채택 곤란 |
| Nominatim 자체호스팅 | PostGIS + OSM 베트남 추출본 유지보수 부담이 시트 하나에 비해 과설계 — 권고 안 함 |
| 권고안 | **1순위 Goong(베트남 로컬, 저가, 결제 리스크 분리) / 2순위 Google Geocoding+Places Autocomplete** |

**🔴 번지(house_number)는 나오지 않는다 — 실측으로 확인**
호치민 두 지점에 Nominatim reverse 를 실제 호출한 결과, `address` 객체에 **`house_number` 키 자체가 없었다**:
```
Nguyễn Huệ            → road: "Nguyễn Huệ"              house_number: 없음
Hẻm 76/50 Phan Tây Hồ → road: "Hẻm 76/50 Phan Tây Hồ"   house_number: 없음
```
베트남은 OSM 번지 매핑 밀도가 낮다. **Google/Goong 이 상업 DB 결합으로 더 나을 가능성은 있으나 키가 없어 직접 검증하지 못했다(미확인).** 위 UX 결정(도로명 자동 + 번지 수동)은 이 실측에 근거한다.

**같은 호출에서 2025 행정구역 개편도 재확인**: 두 지점 모두 `city: "Thủ Đức"` 로 응답(구 `Quận 1`/`Phú Nhuận` 표기 아님). `backend/scripts/geocode_flood_hotspots.py:27-32` 주석의 *"질의에 `Quận N` 을 넣으면 결과 0건, 빼면 5건 정상"* 실증과 궤를 같이한다. **어느 공급자를 쓰든 질의 문자열에 번호 구를 넣지 말 것.**

#### 구현 시 설계 (착수하면 그대로 따를 것)

| 항목 | 결정 |
|---|---|
| 호출 주체 | **BFF 프록시.** 시크릿을 DB `app_config` 에 두고 BFF 가 읽는 기존 관례(`google.map`·`translate` 그룹)와 일치. 키를 프론트에 내리면 도용 위험이고, Directions 를 "서버 전용, 리퍼러 제한 쓰지 말 것" 으로 이미 정한 전례가 있다 |
| 캐시 | `services/translate.py` 의 Redis→DB→provider 3계층을 미러링. 단 **히트율 기대는 낮다** — 업체 위치는 사용자마다 제각각이라 번역만큼 반복되지 않는다. 구조 재사용의 이점(구현 단순·폴백)만 취한다 |
| 서비스권 충돌 | **신규 로직 불필요.** 검색으로 얻은 좌표든 탭으로 찍은 좌표든 `picked` state 에 넣고 기존 `inServiceArea` 체크를 통과시키면 `outOfArea` 배지·확인버튼 비활성이 그대로 재사용된다 |
| rate limit | 타이핑 디바운스(~300ms) + 이전 요청 abort. 이 화면은 이미 `AbortController` 를 쓴다 |
| 비용 상한 | **fail-open.** 지오코딩은 부가 편의이고 지도 탭-투-픽은 그대로 살아야 한다 — quota 초과·provider 실패 시 자동완성/역지오코딩 UI 를 조용히 숨기고 기존 수동 방식으로 폴백(Directions 키 미설정 시 "준비중" 폴백과 같은 패턴). 안전정보처럼 "실패를 안전으로 둔갑" 시키는 성격이 아니다 |

#### 착수 전 해야 할 것
공급자 결정은 **대표 계정 작업**(Goong 키 발급 또는 Google Geocoding/Places Enable)이 선행돼야 한다. 둘 다 무료 키로 받아 **호치민 실주소 여러 건에 번지 반환 여부·개편 행정명 대응·응답 품질을 실측 비교**한 뒤 고르는 것을 권한다.

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

## 🧪 DEV 임시물

### ⬜ [DEV] 동탄역 테스트 핀 제거 (2026-08-07 추가)

**목적**: 베트남 현지에서 실기기 GPS 카메라 연출(course-up 회전·flyTo·추종)을 검증할 수 없어, 한국(경기 화성 동탄역) 실좌표를 주유소 목록에 임시로 심어 실기기에서 「경로」 진입 → 나침반 회전/추종을 확인하기 위한 검증용 코드다. **실기기 검증이 끝나면 즉시 제거해야 한다.**

**제거 절차**
1. `grep -rn DEV_DONGTAN_PIN` (레포 루트) — 프론트/백엔드 전 지점이 한 번에 잡힌다.
2. 잡힌 지점을 전부 삭제:
   - `frontend/src/pages/info/InfoGasList.tsx` — `DEV_DONGTAN_PIN` 상수, `isDev` state/effect, `fetchStations` 의 append 분기, 경로 버튼의 `devFlag`.
   - `frontend/src/pages/ride/RideNav.tsx` — `isDev`/`devRaw`/`devBypass`, `fetchRoute` 의 `bypassAreaGate`·`travelMode` 전달부.
   - `frontend/src/api/info.ts` — `routeApi.getRoute` 의 `travelMode` 파라미터(선언부 + `params.set('travel_mode', ...)`).
   - `backend/app/routers/info_route.py` — `_DEV_MODE` import, `travel_mode` 쿼리 파라미터, `_cache_key`/`_fetch_directions` 의 `mode` 인자(원복 시 `TWO_WHEELER` 하드코딩으로 되돌릴지 여부는 재검토 — 캐시 키에 mode 를 유지하는 것 자체는 무해하니 그대로 둬도 됨).
   - `backend/app/tests/test_info_route.py` — 추가된 `test_drive_mode_*`, `test_cache_key_includes_travel_mode` 테스트.
3. **백엔드 파라미터(`travel_mode`)도 함께 제거해야 한다** — 프론트만 지우면 죽은 쿼리 파라미터가 백엔드에 남는다.
4. 제거 후 재빌드: `docker compose --env-file .env up --build -d bff frontend`.

**참고**: 이중 게이트(프론트 `is_dev` AND URL `devRaw` 플래그, 백엔드 `_DEV_MODE` AND `travel_mode=DRIVE`) 구조라 운영 서버에서는 애초에 활성화되지 않는다 — 제거가 늦어져도 사용자 영향은 없지만, 죽은 코드이므로 검증 완료 후 정리할 것.
