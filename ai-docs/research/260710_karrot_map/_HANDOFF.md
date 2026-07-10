# 당근 동네지도 벤치마크 리서치 — 핸드오프 원장

## 메타
- 지시자: 대표님
- 수행자: Claude (오케스트레이터 = Fable 메인 세션 / 수집 = Sonnet 서브에이전트)
- 작업공간: /mnt/c/DEV/saigon_rider/ai-docs/research/260710_karrot_map/
- 정본 산출물: ai-docs/research/260710_karrot_map/당근_동네지도_조사.md
- Plane 추적: **SGR-315 동네지도 개편** (하위 R-1~R-5 = SGR-316~320)
- 최종 갱신: 2026-07-10

## 목적
- 표면 지시: "당근 어플의 동네지도 기능을 조사해서 현재 '사이공라이더'의 동네지도를 개편할거야. 그러기 위한 사전 조사를 진행."
- 실제 의도: **사이공라이더 동네지도 개편 방향 제안서** — 당근 동네지도의 구조·기능 중 우리가 *채택/변형/배제*할 것을 판단 근거와 함께 제시 (사용자 확인 완료)
- 조사 스코프: **당근 집중** (베트남 로컬 앱 보조 비교는 제외 — 사용자 확인 완료)

## 조사질문 (정본 문서 목차와 일치)
- Q1. 정보구조(IA): 동네지도의 진입점·화면 구성(지도/리스트/검색/카테고리)·앱 내 위상은?
- Q2. 지도 위 콘텐츠: 어떤 객체(업체·장소·게시글·쿠폰 등)가 핀으로 노출되고, 줌/클러스터링·노출 우선순위 정책은?
- Q3. 데이터 소싱: 장소·업체 데이터를 어떻게 채우나(비즈프로필 등록·유저 제보·POI 제휴)? 콜드스타트 해법은?
- Q4. 참여 루프: 후기·단골·소식·쿠폰 등 지도와 연결된 리텐션 장치는?
- Q5. 수익화: 동네지도 ↔ 광고(비즈프로필·검색/노출 광고)의 결합 방식은?
- Q6. (종합) 사이공라이더 현행 동네지도 대비 갭 — 채택/변형/배제 판단

## 단계 진행 상태
- [x] R-1. (Fable 메인) 골격 + 원장 생성 — 검증: 조사질문 6개 확정, Plane SGR-315~320 발행 ✅
- [x] R-2. (Sonnet) 당근 공식 출처 raw 수집 — sources/official_*.md 10건 ✅
- [x] R-2.5. (Fable) 지시자 제공 실기기 스크린샷 2장 반영 — input/ + sources/input_screenshots_observations.md ✅
- [x] R-3. (Sonnet) 외부 분석(기사·광고 가이드) raw 수집 — sources/external_*.md 6건 ✅
- [x] R-4. (Sonnet) 사이공라이더 현행 동네지도 현황 스냅샷 — sources/internal_current_map.md ✅ (codebase-memory MCP 세션 부재 → grep/Read 대체, 파일에 명시)
- [x] R-5. (Fable 메인) 종합·판단 — `당근_동네지도_조사.md` 완성 ✅ (Q1~Q6 전부 결론 + 출처 식별자 병기 + 채택/변형/배제 14항 표 + 잔여 갭 정직 표기)

## 다음 착수 지점 (현재 커서)
- **리서치·계획 모두 완료 (2026-07-10).** 선결 결정 2건 대표 승인: ⓐ info 통합 안 함(레이어 확장 구조만 확보) ⓑ 업체 핀도 줌 게이트 뒤.
- **구현 SoT는 이 폴더가 아니라** [`ai-docs/task/active/260710_map_biz_pin_layer_task.md`](../../task/active/260710_map_biz_pin_layer_task.md) — T1~T7 = Plane SGR-321~327, Notion 미러 `3993bd6b-405d-8137-b8b4-c9c248a2d023`.
- 다음 세션은 그 태스크 md만 읽고 T1(SGR-321, BFF 업체 지도 API)부터 착수. 이 원장은 리서치 이력 보존용으로 종결.
- R-4 부수 발견(기록): current.md의 "SaigonDistrictMap 집계 배지" 항목은 동네지도가 아니라 info 서브페이지 지도 몫 (오인 소지)

## 수집된 raw 소스
| 식별자 | 원본 URL/파일 | 저장경로 | 상태 |
|--------|--------------|----------|------|
| OF-1 | about.daangn.com 로컬맵스팀 인터뷰(→careers) | sources/official_daangn-blog-localmaps-interview.md | 수집완료 (최중요 — 팀·목적·자체지도·LLM) |
| OF-2 | 2024-11-15 PR 동네지도 챌린지 | sources/official_pr-neighborhood-map-challenge-2024.md | 수집완료 |
| OF-3 | 2026-02-27 PR 빵집 TOP100 지도 | sources/official_pr-bakery-top100-2026.md | 수집완료 |
| OF-4 | 2022-07-07 PR 당근지도 카테고리 확대 | sources/official_pr-danggeun-map-category-expansion-2022.md | 수집완료 (서비스명 변천사) |
| OF-5 | 2023-08-17 PR 반경 타기팅 광고 | sources/official_pr-radius-targeting-ad-2023.md | 수집완료 (참고용) |
| OF-6 | 2025-09-03 PR 동네걷기 | sources/official_pr-neighborhood-walk-2025.md | 수집완료 (동네지도 탭 내 혜택 미션) |
| OF-7 | business.daangn.com 비즈프로필 소개 | sources/official_business-daangn-bizprofile-about.md | 수집완료 (카피만) |
| OF-8 | businessdaangn.gitbook.io 비즈프로필 생성 가이드 | sources/official_business-daangn-gitbook-create-guide.md | 수집완료 (업종=카테고리, 주소→동네지도 반영) |
| OF-9 | medium.com/daangn LLM 활용 (2024-04-15) | sources/official_medium-llm-usage.md | 부분 수집 (게시글→LLM 장소태깅→지도 반영) |
| OF-10 | daangn.com 동네지도 전국 오픈 공지 | sources/official_daangn-business-post-map-launch.md | 수집완료 |
| IN-1 | 지시자 제공 실기기 스크린샷 (동네지도 탭 기본 화면) | input/참고용 이미지1.png | 수집완료 (**1차 자료**) |
| IN-2 | 지시자 제공 실기기 스크린샷 (장소 선택 상태) | input/참고용 이미지2.png | 수집완료 (**1차 자료**) |
| IN-obs | IN-1/IN-2 관찰 노트 (Fable이 이미지에서 사실만 추출) | sources/input_screenshots_observations.md | 작성완료 |
| EX-1 | economist.co.kr 2021-05-26 오픈맵 출시 | sources/external_economist-map-launch-2021.md | 수집완료 (무료 등록·유료 노출, 이용자 반발) |
| EX-2 | sedaily.com 13081339 | sources/external_sedaily-map-launch-2021.md | 수집완료 (장소 상세 구성: 메뉴·가격·후기·동네생활) |
| EX-3 | etnews.com 2023-04-27 | sources/external_etnews-map-analysis-2023.md | 수집완료 (2021-11 정식 오픈 확인, 데이터 랭킹) |
| EX-4 | greened.kr 330532 (2025) | sources/external_greened-ad-criticism-2025.md | 수집완료 (광고비↔노출 비판, 피라미드 구조 지적) |
| EX-5 | 머니투데이 2026-04-08 (daum 미러) | sources/external_moneytoday-map-search-ad-2026.md | 수집완료 (**최신**: 동네지도 검색결과 상단 검색광고 시범) |
| EX-6 | inside.ampm.co.kr 13671 (2025) | sources/external_ampm-ad-guide-2025.md | 수집완료 (광고 8단계·CPC·노출 위치 선택) |

## 수집 후 잔여 갭 (R-5 종합 시 "확인 불가"로 정직하게 표기할 것)
- ~~실사용 화면 구성~~ → **IN-1/IN-2 1차 자료로 해소**
- ~~광고 노출 위치·과금~~ → **EX-4/EX-5/EX-6으로 해소** (2026-04 동네지도 검색광고 시범 포함)
- 장소 상세 페이지: EX-2로 "메뉴판·가격·후기·동네생활 이야기"까지 확보. **별점 유무·단골/채팅 버튼 배치는 원문 미확보** (전문 역기획 글 미발견)
- 핀 노출 선별 알고리즘(줌/클러스터링 기준): **원문 확보 실패** — 공식 FAQ(cs.kr.karrotmarket.com faqs/13808 등)가 SPA라 WebFetch 불가. 대행사 추정("단골/후기가 노출에 영향")은 신뢰도 낮아 미채택. 필요 시 브라우저 기반 도구로 재시도
- 동네지도 자체 정량치(이용자·업체 수): 공식 부분치만 (2022 "3배", 2025 "제안 장소 90%↑·열성유저 10배·방문가게 33만")

## 미해결 질문 / 주의
- 당근 동네지도는 앱 내 기능이라 공개 웹 문서가 제한적일 수 있음 → 공식 블로그/보도자료/테크블로그/앱스토어 릴리즈노트를 폭넓게 훑을 것
- 사이공라이더 컨텍스트: 동네지도는 2026-07-07 줌 게이트·GPS 4컨텍스트 회귀까지 완료된 상태. 개편은 "기능 추가/구조 재편" 관점 (SGR-312 비즈프로필·광고 인프라가 이미 존재 — Q5 판단 시 연결 고려)
- Plane 상태 변경은 doil-services MCP 부재 시 Plane REST API 직접 호출로 처리 (키: /mnt/c/DEV/docker/doil-sb/mcp/config.yml, 노출 금지)
