# 동네지도 개편 P1 — 업체 핀 레이어 (SGR-315)

> 발행 2026-07-10 · 부모 Plane **SGR-315 동네지도 개편** · 근거 [`research/260710_karrot_map/당근_동네지도_조사.md`](../../research/260710_karrot_map/당근_동네지도_조사.md) §6
> Notion 미러: https://app.notion.com/p/3993bd6b405d8137b8b4c9c248a2d023
> Plane 서브 Todo: T1~T7 = **SGR-321~327** (1:1 매핑, 착수 시 IN_PROGRESS 전환)
> **다음 세션은 이 문서만 읽고 바로 T1(SGR-321)부터 착수한다.** 리서치 재독 불필요 (필요 배경은 본 문서에 자족적으로 요약).

## 목적

동네지도(`/map`)를 "중고 매물 지도"에서 "로컬 비즈니스 발견면"으로 전환하는 1단계. **SGR-312로 이미 구축된 비즈프로필(APPROVED 승인 게이트·`/biz/:id` 공개 프로필)을 동네지도의 제3 핀 레이어로 연결**한다. 신규 인프라 발명 없음 — 연결이 전부다.

## 확정 결정사항 (2026-07-10 대표 승인 — 재론 금지)

1. **info 계열(주유·정비·침수) 통합은 이번에 안 한다.** SaigonDistrictMap 이원화는 현상 유지. 단, T3의 핀 레이어 구조는 유형 확장 가능하게(레이어 배열) 잡아 향후 info 흡수가 "레이어 추가"로 끝나게 한다.
2. **업체 핀도 줌 게이트 뒤에 둔다.** 게이트 미만(줌아웃)에서는 매물·피드와 동일하게 fetch 0건·핀 0개. 재검토 조건: APPROVED 업체 수백 건 도달 + 노출 티어(광고 상품) 논의 시점.
3. P2(업체 후기+RP 리워드+찜)·P3(단골·쿠폰·소식)는 **이번 패키지에서 착수 금지** — P1 안착 후 별도 발행. (제안서 §6 실행 순서)

## 현행 사실 (착수 전제 — 검증된 코드 사실)

- `business_profile` 모델에 `category(60)/address(200)/latitude/longitude(Numeric 9,6)` **이미 존재** (`backend/app/models.py:522-548`) — 스키마 마이그레이션 불필요.
- 신청/수정 API도 좌표를 이미 수수 (`backend/app/routers/biz.py:74-77, 131-134`). 공개 조회 `GET /biz/public/:id`도 좌표 반환(`:331-334`).
- **dev 시드 5건(init/114)은 name/phone/address만 채움 — 좌표·카테고리 NULL** (`database/init/114_business_dev_migration.sql:31`). 현재 DB 최신 init은 116.
- 동네지도 핀은 매물/피드 2종 하드코딩: `NeighborhoodMap.tsx:25-26`(LISTING_COLOR `#ff6f3c`/FEED_COLOR `#3b82f6`), `:313-328` markers useMemo, 탭 `listings|feed`(`:22`). `SaigonMapV5` 마커는 `MapMarkerV2[]`(id/lat/lng/color/onClick — **라벨 없음**, `SaigonMapV5.tsx:119`), 게이트 조건 `vb.w < L2_VBW`에서만 렌더(`:831`).
- 줌 게이트: 게이트 미만 시 fetch 생략(`NeighborhoodMap.tsx:248-251`). GPS 자동측정 0 (`locateOnMount` 미전달). 회귀 명세 `TEST/map_test_scenarios.md`(GPS 4컨텍스트 A/B/C/D×30케이스).
- `/biz/:id`(BizPublic 화면)·`adHref()` 헬퍼는 BP-6로 완성(`frontend/src/api/market.ts:227-229`).

## 서브태스크 (검증 기준 포함 — 순서대로)

### T1. BFF: 업체 지도 조회 API
- `GET /biz/public/map?min_lat&max_lat&min_lng&max_lng[&category][&q]` — `status=APPROVED` AND 좌표 NOT NULL만, bbox 필터. 응답: `id, name, category, lat, lng, photo_url`(photo_content → `build_imgproxy_url()` resolver, 규약 §7 준수). 무인증 공개(기존 `GET /biz/public/:id`와 동일 층위). 상한 200건.
- 기존 `routers/biz.py`에 추가 — 신규 라우터 파일 만들지 않는다.
- **검증**: curl bbox(HCMC 전역) → T2 시드 5건 반환·photo_url 해석. bbox 밖 좌표 → 0건. PENDING/SUSPENDED 프로필 미노출.

### T2. dev 시드 보강 + 신청 폼 좌표 입력
- `database/init/117_biz_profile_map_seed.sql`: dev 5건에 HCMC 실좌표(구별 분산: D1·D3·Bình Thạnh·D7·Phú Nhuận 등) + category(라이더 유관: `repair`(정비)/`cafe`/`food`/`wash`(세차)/`parts`(용품) 중 배정) UPDATE. dev DB 적용.
- 신청 화면(`/biz/apply`) 폼에 좌표 입력 UI 유무 확인 — **없으면** 기존 `LocationPickerSheet` 재사용해 "가게 위치" 선택 추가(주소 텍스트와 별개, 선택사항). API는 이미 받으므로 배선만.
- **검증**: T1 API에 5건 좌표·카테고리 포함 / 신규 신청 → 좌표 저장 → 승인 → 지도 조회에 등장(종단).

### T3. 프론트: 핀 레이어 구조 확장 + 업체 핀
- `NeighborhoodMap` markers 구성을 **레이어 배열 구조**로 정리(listing/feed/biz 3유형 — 향후 info 흡수 대비. 과추상화 금지: 유형별 {color, fetch, onClick} 수준이면 충분).
- `SaigonMapV5` `MapMarkerV2`에 **선택적 `label`**(상호명) 지원 추가 — 업체 핀만 라벨 표시(당근 IN-1 패턴: 아이콘+상호명). 매물/피드 핀은 현행 무라벨 유지(회귀 0).
- 업체 핀 시각: 매물 주황과 구분되는 별도 색/형태(브랜드 오렌지 절제 원칙 — design-uplift-260707 계열 고려, 구현 시 판단).
- **줌 게이트 준수**: 업체 fetch도 게이트 통과 시에만(`showDistrictBadges` 판정 재사용).
- **검증**: `tsc -b` 0 / eslint error 0 / 게이트 미만에서 업체 fetch 0(네트워크 탭) / 3종 핀 동시 렌더 / 기존 매물·피드 핀 시각 변화 없음.

### T4. 프론트: 업체 탭 + 카테고리 칩
- 시트 탭 `listings|feed`에 **`biz`(업체) 추가** — 기존 세그먼트 패턴 미러. 업체 탭 리스트 = 지도와 동일 bbox 소스(지도·리스트 단일 소스 원칙 유지).
- 업체 탭 활성 시 지도 상단에 **카테고리 칩**(가로 스크롤: 전체/정비/세차/카페/음식/용품 — T2 category 값과 일치, i18n ko/en/vi 3종). 칩 선택 = T1 `category` 파라미터.
- 리스트 아이템 = 업체 카드(사진 `<AppImage>`, 이름, 카테고리, 주소) — 탭 시 `/biz/:id`.
- **검증**: 탭 전환 시 핀↔리스트 집합 일치 / 칩 필터 동작 / 빈 카테고리 빈 상태 문구(3개 국어).

### T5. 프론트: 업체 핀 탭 상호작용
- 업체 핀 탭 → 시트 mid로 올리고 해당 업체 카드 하이라이트(기존 `handleMarkerClick` 매물 패턴 미러 — 바텀시트 원칙 "핀 탭 시에만 자동 이동" 준수) → 카드 탭 → `/biz/:id`.
- **검증**: 핀 탭→카드→상세→뒤로가기→지도 뷰포트 유지(재진입 복원 경합 회귀 주의 — 7/7 FAIL 이력 있는 지점).

### T6. 프론트: 업체 검색
- 업체 탭에서 검색 패널 사용 시 T1 `q` 파라미터로 업체명 검색(매물 검색과 동일 UX — 최근검색어 공유). 통합 검색(매물+업체 동시)은 **이번에 안 함**.
- **검증**: 시드 업체명 검색 → 결과 카드 → 상세 진입.

### T7. 회귀 + 마무리
- `TEST/map_test_scenarios.md` 핵심 케이스 스모크: GPS 4컨텍스트(A/B/C/D) × {게이트, 핀 탭, 재진입 복원} + 업체 탭 추가분.
- 빌드: `docker compose --env-file .env up --build -d frontend` (npm run build 직접 실행 금지). BFF 재시작.
- codebase-memory `index_repository(moderate)` + ADR 갱신(동네지도 탭 3종·업체 레이어 반영 — 재인덱싱 후 ADR 초기화 여부 확인 규약 §9 준수).
- 문서: frontend-page-map.md 동네지도 항목, current.md·history 이관, Plane 서브이슈 DONE 처리.
- **검증**: 회귀 전건 PASS 기록을 이 문서 하단에 추가.

## 제약 (위반 = 회귀)

- 프론트 동적 이미지 `<AppImage>` 필수 / BFF는 Engine DB 직접 접근 금지(이번 작업은 Engine 무관) / `navigator.*` 직접 호출 금지 / 이미지 출력은 contents resolver 경유.
- **줌 게이트·GPS 원칙(화면 진입 시 자동측정 0)은 예외 없이 유지** — 결정사항 2.
- 기존 매물/피드 동작·시각은 건드리지 않는다(수술적 변경). AdCard 삽입 로직도 불변.
- 운영 배포 시: init/117 적용 + BFF 재시작 (프론트 재빌드 포함).

## 검증 기록 (2026-07-10 구현 세션)

**T1~T7 전건 구현 완료.** 커밋: T1 `13420c9` / T2 `1286615` / T3 `12ef2a3` / T4 `6af11d5` / T5 `b299002` / T6 `6275643`. Plane SGR-321~327 전건 Done.

- **T1/T2 (API·시드)**: nginx(:18090) 경유 curl — HCMC bbox 5건(좌표·카테고리 전건), `category=repair` 1건(Moto Care), `q=Scooter` 1건, 전역 bbox `q=moto` 1건, bbox 밖 0건, PENDING 전환 시 미노출→원복 확인. photo_url은 시드 사진 없음 → null(정상). `/biz/apply` 좌표 입력은 **기존재**(LocationPickerSheet 배선 완료 상태) — 프론트 변경 0. 단, 현행 폼은 좌표 필수(canSubmit)로 계획서의 "선택사항"과 상이 — 기존 동작 존중, 필요 시 별도 결정.
- **T3~T6 (프론트)**: `tsc -b` 0 / eslint error 0(warning은 기존 패턴 동일 계열) / 도커 프론트 재빌드 성공·:18090 서빙 200. 줌 게이트는 매물/피드 fetch와 동일 ref(`showDistrictBadgesRef`) 재사용으로 게이트 미만 fetch 0 보장(코드 검증). 기존 매물/피드 핀 시각·AdCard 로직 무변경(diff 검증).
- **해석 결정**: "3종 핀 동시 렌더"는 업체 핀 = **탭 무관 상시 제3 레이어**로 구현(당근 G-1/G-2: 업체 핀은 지도의 기본 콘텐츠, 근거 조사 §2·§6). 매물/피드 탭에서도 업체 핀+라벨 노출. 탭 배타로 바꾸려면 `NeighborhoodMap.tsx` markers 레이어 1곳 수정.
- **독립 리뷰(qm-reviewer) PASS** — 6개 렌즈(매물/피드 회귀·줌 게이트 deps 전 경로·재진입 remount 경합·검색 스코프 잔재·UX·i18n) 전건 통과. 비차단 노트 3건: ⓐ SaigonMapV5 의 `label`/`r` 활성화로 **info 3화면 핀 시각이 함께 바뀜**(InfoRepairList·InfoGasList 는 이미 label 을 넘기고 있어 상호명 라벨이 새로 보임, InfoFloodMap 은 r 배수 반영 — 타입 계약의 의도된 활성화이나 배포 전 시각 확인 권장, 밀집 시 라벨 truncate 후속 검토) ⓑ biz 탭에서 고른 카테고리 필터가 매물/피드 탭의 상시 업체 핀에도 남는데 칩 UI 는 biz 탭 전용이라 숨은 상태가 됨(제품 판단 여지) ⓒ biz 탭 로딩 중 헤더 건수가 이전 값 잠시 표시(본문 스켈레톤 있어 미미).
- **⚠ 잔여 (수동/후속)**: ① `TEST/map_test_scenarios.md` GPS 4컨텍스트 실기기/브라우저 스모크(이 세션은 코드·API 레벨 검증 — 시각 확인 필요: 3종 핀 렌더, 핀 탭→카드→상세→뒤로가기 뷰포트 유지, 칩 필터, 빈 상태 3개 국어) + 리뷰 노트 ⓐ의 info 3화면(주유·정비·침수) 핀 시각 확인 ② codebase-memory 재인덱싱+ADR 갱신(세션 중 MCP 끊김 — 다음 세션 `index_repository(moderate)`) ③ 운영 배포: init/117 적용 + BFF 재시작 + 프론트 재빌드.

## 백로그 (이번 패키지 밖 — 착수 금지)

- P2: 업체 후기(텍스트 중심) + RP 리워드(info 정비리뷰 패턴 재사용, 일일캡) + 업체 찜
- P3: 단골(팔로우)·쿠폰 연계·업체 소식 핀 뱃지
- info 계열 지도 통합 / 줌아웃 업체 노출 티어(재검토 조건: 업체 수백 건+광고 상품 논의)
- 업체 핀 노출 선별 로직(과밀 시): 초기엔 전수 노출, 과밀해지면 후기수/최신활동 우선 — P2 이후
