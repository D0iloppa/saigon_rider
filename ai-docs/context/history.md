# 완료 작업 이력 (Session History)

> 완료(✅)된 세션 작업 이력 아카이브. `current.md` 경량화를 위해 분리.  
> 필요 시에만 로드. 최신순 정렬.

---

## 2026-06-04

- **개발서버 → 운영서버 1차 배포 + 배포 SOP 수립 (SGR-220 DONE)** — 운영 `https://letantonsheriff.com`(임시 도메인, 기존 lsh 대체) 가동. SoT: `task/active/260604_deploy_prod_task.md`(runbook, 배포 기준 지침). **결정**: 별도 운영 호스트(Rocky 9.6, `ssh saigon-prod`)·git pull+compose build·**nginx 2계층(ADR-001, 호스트 nginx→`127.0.0.1:18090`)**·`/app/SaigonRider` 격리. **수행**: 프로비저닝(Docker 설치·wellconn docker그룹·read-only deploy key clone) → P2 `docker-compose.prod.yml`(포트 비노출·소스마운트 제거·mcp_dev 제외, `!override/!reset`) → P3 운영 `.env`(시크릿 회전, 키셋 일치) → P4 호스트 nginx(`lsh_api.conf`에서 root+www 분리, `saigon.conf` 추가, 기존 cert 2-SAN 축소+자동갱신 `saigon-cert-renew.sh`+cron) → P6 빌드·기동(8컨테이너, 포트격리 검증) → P5 데이터(dev 전체 dump→drop&recreate&restore, 테스트유저 정리: item140/quest243/district41, users0). 이미지·아바타 서빙 200 검증. **버그 교정**: `BFF_PUBLIC_URL`에 `/api/bff` 누락(아바타 폴백 SPA 루프백)→교정. **네이티브**(별 repo): AppConfig baseURL dev/prod 빌드 분기(iOS `#if DEBUG`/Android `BuildConfig.DEBUG`), serviceKey 단일 유지 위해 운영 `ENGINE_SERVICE_KEY`를 앱 값으로 정렬(SRE 200/401 검증). grand-opening 공식 피드(Saigon-Rider) 이관·content_id 배선·카운터 재계산. **도메인 마이그레이션 규칙**(host 참조 7지점 + 절차) 문서화. md+Notion+Plane(P1~P6+main DONE) 동기화. **후속**: SGR-227(init 스키마 베이스라인 결함 — fresh DB 빌드 불가, dump-restore 우회), FCM firebase json 마운트, official/grand-opening.jpg 1건.

## 2026-06-02

- **주행거리(마일리지) 표시 누적 전환 (SGR-207)** — "10km+ 쌓인 마일리지가 0.x로 줄어듦" 점검. 원인은 초기화 로직/테스트 쿼리 아님: 화면이 보여주던 값이 BFF `/users/me/stats`의 `total_km`=**이번 달**(period, `user_mileage_log` since month_start)이라 6/1 월 경계에서 5월 누적분이 집계 이탈. 평생 누적은 `sre_user.total_distance_m`에 보존(검증: user_id 1 → 5월 10,473m + 6월 2,981m = 13,454m, 로그 602건 합계 일치). 조치: BFF가 `lifetime_km`(=`total_distance_m`/1000) 필드 신설해 함께 반환(`total_km`=이번 달 유지), 프론트는 ①`WorldMap.tsx` 홈 아바타 옆 마일리지 ②`ProfileMain.tsx` "총 누적 주행 거리" odometer 카드(+tier 배지/진행바)를 `lifetime_km`으로 전환(odometer는 라벨이 "총 누적"인데 월간값 읽던 버그). "이번 달" 통계 카드는 `total_km` 유지. 변경: backend `routers/users.py`,`schemas.py` · frontend `api/types.ts`,`api/profile.ts`,`pages/home/WorldMap.tsx`,`pages/profile/ProfileMain.tsx`. bff+frontend 재배포·시각검증 완료, Plane SGR-207 DONE. (커밋/푸시 미실행)
- **홈 오늘의 미션 — 수령가능 횟수 공통화 + 수령 시 시작 확인 alert (SGR-206)** — ①BFF `quests.py`: 일일 수령가능 횟수를 단일 공통함수 `_daily_claimable_max(db,user)` = `_daily_slot_base`(`sre_seed_config.DAILY_QUEST_BASE_SLOTS`, def 3) + `_level_slot_bonus`(hook·0) + `_item_slot_bonus`(hook·0)로 통합. accept 게이트와 `/quests/recommended`가 공유. 레벨/아이템 +α는 A-2(아이템 효과정의) 시 두 hook만 채우면 양쪽 동시 반영. ②`/quests/recommended` 재구성: `remaining=max(공통max−오늘사용량,0)` 개를 DAILY 풀에서 `func.random()`으로 선정(오늘 수령/완료/만료 제외), 0이면 빈 배열→홈 "제공할 퀘스트 없음". 기존 `AppConfig recommend_max_count`(보상순 고정 N) 의존 제거(+ orphan import 정리). ③SGR-206 본건 `QuestDetail.tsx`: 수령하기 성공 직후 확인 다이얼로그 "해당 퀘스트를 바로 시작하겠습니까?" — 수행 시작→`/ride/active`, 취소→수령 상태 유지(토스트). 기존 `styles.dialog*` 패턴 재사용(브라우저 confirm 미사용). ④409 토스트 정리: 슬롯 만석 등 예상 에러 시 전역 `HTTP 409 | …` 접두사 제거→서버 detail("일일 퀘스트 슬롯이 가득 찼습니다.")만 노출. `acceptQuest`에 `rethrow` 옵션으로 호출 단위 오버라이드(전역 핸들러 미변경). 프론트 docker 이미지 재빌드·재배포, 시각검증 완료, Plane SGR-206 DONE. ⑤후속(commit 74202c7): 데드 설정 `recommend_max_count`(app_config) 제거(admin·settings.html·030 시드 SQL + 운영 DB 행 DELETE) + base 값 `DAILY_QUEST_BASE_SLOTS`를 admin 라이딩 표시 정책 페이지에서 1~10 편집 가능하게 배관 보강(engine `GET /v1/config/seed/{code}` 신설 → bff `engine_client.get_seed()` → `update_seed()`, BFF→Engine HTTP API 규약 준수).
- **프로필 '내 바이크' 장착 아이콘 깨짐 (SGR-212)** — 프로필 '내 바이크' 미니 행 일부 아이콘이 broken-image. 원인: `ProfileMain.SLOT_EMOJI`가 슬롯 체계 개편(SGR-200/201) 이전 구버전→신규 슬롯 미매핑→폴백 `1f4e6` 이모지가 Noto **animated** CDN(`/{code}/512.gif`)에 없어 404 + 해당 `<img>`만 `onError` 부재. 조치: 슬롯 이모지 → 앱 표준 `ItemSvgRenderer`(실제 아이템 SVG, viewBox 폴백 내장)로 교체, 이모지-CDN 의존 제거, orphan `SLOT_EMOJI` 제거. 배포·시각검증 완료, Plane SGR-212 DONE. 트러블: `trouble/260602/260602_profile_mybike_broken_icons_troubleshooting.md` (잔여: `Garage.tsx`에 동종 `SLOT_EMOJI` 1벌 남음 — 빈 슬롯 칩 표기용, 단일화 후속 여지)
- **가챠 hang → 재진입 시 신규 화면 (SGR-205)** — `GachaPull.tsx` 뽑기 로직이 `useEffect([])`+`didPull` 가드 안에 있어 마운트 1회만 실행 → "다시 뽑기"가 state만 리셋하고 effect 재실행 불가 → `SUMMONING…` 영구 정지(=hang, 15s timeout). 뽑기 로직을 `runPull()` `useCallback`으로 추출해 마운트·"다시 뽑기" 양쪽 호출, 가드를 boolean→param-key(`gachaCode-is10`)로 전환(StrictMode 이중마운트 차단·파라미터 변경 재진입 시 신규 뽑기). timeout `timeoutRef` 관리. 배포·시각검증 완료, Plane SGR-205 DONE. 트러블: `trouble/260602/260602_gacha_hang_reentry_troubleshooting.md`
- **가챠 시네마틱 뽑기 연출 (SGR-211)** — "화면이 순식간에 지나가 도파민 없음" 피드백 → 풀 시네마틱으로 확장(콘셉: 닌텐도식 게임필). 상태머신 `charging→flash→reveal→result`(+ SKIP 즉시 결과): ①charging 오브 심장박동 맥동+회전 링 2겹+빛기둥, 결과 도착 시 레어도색 글로우(골드=L/M 떡밥) ②화이트 방사 플래시 ③카드 스쿼시&스트레치 오버슈트 순차 등장(140ms)·best 스포트라이트·고레어 광선+컨페티·M등급 풀스크린 신화 ④결과 시트. `native.haptic()` 비트(차징 light/터짐 medium·heavy). 후속: 차징 오브 링/글로우 동심정렬 버그(absolute 미정렬로 우하단 쏠림) → `.orbStage`(224px)+`inset:0;margin:auto`로 해소(transform은 애니 전용). 배포·시각검증 완료, Plane SGR-211 DONE. 태스크: `task/active/260602_gacha_cinematic_reveal_task.md`

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
