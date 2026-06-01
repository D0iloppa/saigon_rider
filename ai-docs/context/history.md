# 완료 작업 이력 (Session History)

> 완료(✅)된 세션 작업 이력 아카이브. `current.md` 경량화를 위해 분리.  
> 필요 시에만 로드. 최신순 정렬.

---

## 2026-06-01

- **바이크 프리뷰 레이아웃/스켈레톤 전면 정비 (SGR-202)** — BODY 5종을 단순 blob→컵 차대 외형(레그실드·플로어보드·탱크·시트·확장 테일)으로 재설계. ①바퀴 축(허브캡)·11시 스티어링 넥을 바디에 추가, 변종별 데칼 재배치(R 배달박스는 STICKER 슬롯 정합) ②`BikeComposite` zOrder 정렬 페인트 → WHEEL(0) 최하단·바디 축이 바퀴 위에 렌더("축이 바퀴 고정") ③`BIKE_BASE_EMPTY` 스켈레톤을 새 바디 실루엣+넥+축+엔진/배기 와이어프레임으로 재정합 ④HANDLE/MIRROR 넥 상단 이동·SEAT 20% 확대·NUMBER 테일 정합 ⑤휠 스핀 전진(반시계) 반전 ⑥JACKET 썸네일 `SLOT_VIEWBOX` 음수/비-0 origin('18 -5 144 144')→'0 0 180 150' 중앙정렬(use 뷰포트 쉬프트 해소). 핵심 교훈: 바디 심볼 `overflow:visible`로 viewBox 밖(넥/포크/펜더) 클리핑 회피. 배포·시각검증 완료, Plane SGR-202 DONE. 태스크: `task/active/260601_bike_preview_overhaul_task.md`
- **신규 아이템 부위 3종 + 라이더 프리뷰 정비 (SGR-201)** — PANTS/KNEE/WHEEL ×5등급 15아이템 추가: slot enum 마이그(sre032)+시드(sre033)+`engine/app/enums.py` ItemSlotEnum+상점 그룹(SHOP_GROUPS, 엔진/프론트 4곳)+metadata/slotLayout/inventory/Garage/SVG 심볼 15개+i18n ko/en/vi. WHEEL pair 렌더+장착 시 회전(`BikeComposite sr-wheel-spin`). 라이더 프리뷰 정비: PANTS 발목까지 연장·스켈레톤 다리 중심선 x120/180 정렬·KNEE/BOOTS 재배치·자켓 5종 **소매 추가**(viewBox 0-origin+`<g translate(30,0)>`로 음수 origin 쉬프트 회피)·자켓 중앙정렬·우측 칩 KNEE↔BOOTS. 배포 완료, Plane SGR-201 DONE. 바이크 프리뷰는 SGR-202로 분리. 태스크: `task/active/260601_new_item_slots_task.md`
- **게러지 '바이크' 프리뷰 레이아웃 + 아이템 정렬 (SGR-200)** — ①bike 탭 슬롯 칩 순서 보정(우측 `[NUMBER,TAIL]`/하단 `[ENGINE,STICKER]`) ②`BIKE_LAYOUT` 착용 좌표 튜닝(ENGINE/SEAT/STICKER/NUMBER/TAIL, 시각검증 반복) ③부위 미선택 시 해당 탭 전체 아이템 표시(`equipPreview.all_items` i18n ko/en/vi) ④`sortItems` 착용 아이템 최상단 우선 정렬. 배포·시각검증 완료, Plane SGR-200 DONE. 태스크: `task/active/260601_garage_bike_preview_layout_task.md`
- **위치 권한 네이티브 정비 (SGR-199)** — 커스텀 GpsPlugin 권한 API 세트 완성. native(ios/android): `checkPermission`/`requestPermission`/`openAppSettings` 추가(외부 pod 0개, CoreLocation 시스템 프레임워크). web: `native.ts` 가 `Gps.*` 호출로 전환, `Settings.tsx` 임시 폴백 다이얼로그(`locationSettingsGuide`) 제거 → denied 시 OS 앱 설정 직행 + 포그라운드 복귀(`visibilitychange`) 시 권한 즉시 재조회. `@capacitor/geolocation` 활성화는 폐기(IONGeolocationLib ↔ Xcode 16.x 빌드 충돌). 실기기 검증·배포 완료, Plane SGR-199 DONE. TS-10(위치정보 표기만 됨) 해소.

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
