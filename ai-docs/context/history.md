# 완료 작업 이력 (Session History)

> 완료(✅)된 세션 작업 이력 아카이브. `current.md` 경량화를 위해 분리.  
> 필요 시에만 로드. 최신순 정렬.

---

## 2026-05-28

- **SaigonDistrictMap 마커 District 집계 배지** — bbox affine → district 집계 배지 전환, MAX_ZOOM 4→6. 코드완료, 시각검증 대기. 태스크: `task/active/260528_map_marker_projection_task.md`

## 2026-05-27

- **유가 정보 표출** — 스크래퍼 3종(스텁) + 3-way validation + Redis 캐시 + 브랜드 마커/바텀시트 + admin manual upsert. 외부 자동 수집은 v1.1 이월. 태스크: `task/active/260527_fuel_price_pipeline_task.md`
- **Capacitor 마이그레이션 완료** — JS-side + native(iOS/Android) 양쪽 Capacitor Plugin 재정의. `capacitor.config.ts`, 커스텀 Plugin 7종(iOS) / 3종(Android), `native.ts` 재작성. Mac 측 빌드 검증 대기. 태스크: `task/active/260520_capacitor_migration_task.md`

## 2026-05-24

- **퀘스트 상세 [DBG] 버튼 숨김** — `QuestDetail.tsx:251-256` 트리거 주석 처리
- **abandonRide 토스트 노이즈 차단** — fire-and-forget → raw `fetch` 우회 (`api/quests.ts:119-126`)
- **게러지 빈 슬롯 그림자 아이콘** — 부위별 유니코드 이모지 + grayscale (`Garage.tsx`)

## 2026-05-22

- **퀘스트 달성 체크 Phase 1~3 전체 완료** — `sre_quest_card` + `quest_tracker.py` + GpsAgent 체이닝 + 데일리 슬롯 + GPS 노이즈 필터 + Push + 만료 배치. 설계서: `engine/sre-quest-completion-design.md`
- **아이템 카탈로그 251개 전면 교체** — 8 sprite, display_name=code + i18n. 태스크: `task/active/260522_item_catalog_replace_task.md`
- **TODO #52 침수 핫스팟 시드** — HCMC 30개 지점 (`037_flood_hotspot_seed.sql`)

## 2026-05-21

- **정보 모듈 Phase 0~4 완료** — 12개 API + 9개 프론트 화면 (InfoHub, InfoWeather, InfoFloodMap, InfoFloodReport, InfoGasList, InfoRepairList, InfoRepairDetail, InfoRepairWrite) + HOME 통합
- **TabBar 피드탭 복구** + **GameHubSheet 정보 추가** + **날씨 500 버그 fix** + **골드 용어 통일**

## 2026-05-20

- Task 7: 관리자 보상 정책 관리 UI — `admin/policies.html` CRUD
- DEV Context 정리 + 월드맵 기획 등록 — Feature #48 등록
- Redis Streams 메시지 큐 도입 — Feature #47, 서브태스크 7건 완료
- Capacitor 도입 (JS-side) — Feature #46, `native.ts` 319→120줄
- SRE 게이미피케이션 v2 전 서브태스크 완료 — Features #42, #44, #45

## 2026-05-19

- 프로필 기록/배지 실데이터 연동 — quest-history, badges, stats API 연동 + 032 마이그레이션

## 2026-05-18

- ProfileCard Draggable Sheet + 피드 조회 (코드 완료, 실기기 검증 대기)
- Profile Sheet 스크롤 UX 수정 (코드 완료, 실기기 검증 대기)
- AppImage 폴백 체인 시스템
- 월드맵 SECTION 1/2 실데이터 연동 (코드 완료, UI 검증 대기)
- 피드 팔로우 카운트 버그 수정 + 언팔로우 확인 다이얼로그
- 앱 버전 관리 시스템 — `app_versions` 테이블 + API 3종 + 관리자 CRUD
- 건너뛰기 시 기본 닉네임 부여 — `nickname_words` 테이블 + 관리자 CRUD
- PTR 러버밴딩 + ProfileSetup 온보딩 UX
- Overscroll Bounce + Profile Sheet 스크롤 Block
- API 에러 Toast + 프로필 수정

## 2026-05-17

- 프로필 피드 관리 기능 — GET/PUT/DELETE `/feed/{post_id}`
- 친구 기능 마무리 — ProfileCard BottomSheet, QR 공유 (FriendAdd 미완)

## 2026-05-16

- 무한스크롤 + Pull-to-Refresh + 퀘스트 완료 구조
- 피드 소셜 기능 확장 — DB 020-023, 프론트 5개 신규 페이지
- 기본 프로필 이미지 풀 (profile_mock) — `owner_type='profile_mock'` 6장
- 관리자 콘솔 콘텐츠 contents 중개 — contents 테이블 원칙 확립
- 관리자 콘솔 전체 기능 구현 — admin 7개 페이지
- 보안/환경 변수 규약 신설 — GUIDELINE §7
- BFF 타임존 확정 — `APP_TIMEZONE` 환경변수

## 2026-05-15

- 시스템 이미지 imgproxy 서빙 구조, DB 마이그레이션 011-013, BFF District 확장, contents 엔드포인트 2종, quests fallback 체인, Mock 이미지 배치, `BFF_PUBLIC_URL` 환경변수, 워크플로우 현행화
