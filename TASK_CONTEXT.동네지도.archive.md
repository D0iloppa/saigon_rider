# TASK_CONTEXT — 동네지도 지도↔리스트 정합성 재설계

## 요청 원문 (요약)
대표님 피드백을 도일이 이해 못 해서 "판단 후 수정" 요청. 핵심 질문:
1. 내가 방향을 잘못잡은 부분이 뭐냐?
2. 최종적으로 어떻게 해야 하냐?
3. "지도와 리스트를 동일하게 띄워라"인지, 아니면 "리스트를 ward→district로 넓혀라"인지?

## 대표님 피드백 핵심 (월/화)
- 매물/피드/업체를 업체와 동일하게 좌 플리킹 카드 박스로 연동.
- "지도와 상관없이 지도 영역만 인식해서 뿌리고" — 실시간 map↔list 재쿼리 하지 말고 현재 뷰포트 영역만 인식해 렌더.
- 실시간 연동/데이터 변환이 심해서 "노답". 물건 많으면 지도 못 씀.
- 해당 배율에서 물건 2~3개만 영역에 맞게 뿌리고 갱신.
- 컨텐츠 기준 지도 이동(카드 플리킹 → 지도 pan).
- 사용자가 시트 올리면 그때 해당 영역 데이터 로드 (점 표출과 1:1 일치 불필요).
- 화요일: "지도는 9 리스트는 6" → 지도에 표출된 물건을 리스트가 봐야지. 쉽게쉽게 해.

## 이미지 근거
- image6: 현재 지도 — 점 91건 전부 뿌림(노답 상태).
- image7: 시트 확장 리스트 106건(지도 91과 불일치).
- image8: 당근 레퍼런스 — 깨끗한 지도 + 단일 핀 + 하단 카드 1개.
- image10(화): 지도 9개 점 vs "Bến Thành · 6건" 뱃지 = 뷰포트 쿼리 vs ward 쿼리 불일치.

## 감독 판단 (해석)
- 도일의 잘못된 방향: 지도=뷰포트 bbox 쿼리 / 리스트=ward 지역 쿼리 → **두 개의 독립 데이터소스**를 만든 것.
- 대표 의도: **현재 지도 뷰포트(bounding box)가 유일한 지리 스코프**. 핀·카드·확장리스트 전부 그 한 payload에서 파생. ward/district 지역쿼리 자체가 잘못된 모델.
- Q3 답: "동일하게 띄워라"가 맞음. ward→district 확장 아님.
- "실시간 연동 금지" ≠ "카드→지도 pan 금지". 금지 대상은 map-move마다 무거운 지역 재쿼리. 원하는 것: 뷰포트 1회 fetch(디바운스/명시적 재검색) → 클라 렌더 → 카드 플리킹은 클라 카메라 이동.

## 표준용어
viewport-bound querying (bounding-box query) + content-driven map panning. 안티패턴 = dual-source (viewport pins vs ward list) mismatch.

## ⚠️ 이 파일 삭제 금지 (도일 지시, 2026-07-14 밤)
작업 완료돼도 삭제하지 말 것. 내일 아침(07-15) 휴먼체크 후 수정에 활용. 결정 로그 누적.

## GOAL (도일 /goal, 자율 오버나잇)
분석 → 설계 → 구현 **전부** 완료. 판단 필요 지점은 멈추지 말고 권장안으로 진행 + 이 파일에 결정 기록.
push 금지(아침 /code-review 게이트 대기). 로컬 커밋은 QM 루프대로 허용.

## 분석 결과 (워커 a336357, 코드 확정)
- 핀(visibleListings/Posts/Biz) = 뷰포트 bbox (NeighborhoodMap.tsx:510-576).
- 리스트(wardListings/Posts/Biz) = 지도중심 ward 폴리곤 (:581-637), 주석에 "소스 분리" 의도 명시(:189-191).
- listListings/listPosts/listBiz = mode==='viewport' ? ward* : visible* (:1119-1126).
- 뱃지 "지역명·N건" 의 N = ward 리스트 길이(visibleCount, :1131,1234-1238) ≠ 핀 개수. → "9 vs 6" 원인.
- "9 vs 6" 3원인: ①핀=뷰포트사각형 vs 리스트=ward폴리곤(엄격) ②bbox vs 폴리곤내부판정 ③줌아웃시 핀은 게이트로 꺼지나 리스트는 살아있음.
- 백엔드: /market/listings=bbox+ward 둘다지원 / /biz/public/map=bbox필수·LIMIT200 / **/feed=bbox미지원, 반경5km(ST_DWithin)만**.
- 지도이동→500ms 디바운스→viewportBbox 갱신→핀 재조회. ward리스트는 centerWard 변경시만. "이 지역 재검색" 버튼 없음.
- 탭전환은 순수 클라(재fetch 없음), 단 biz만 탭진입시 fetch.
- 핀 limit: 매물 MAX_MAP_LISTINGS=300(50페이지 이어받기), 피드 50/40, 업체 백엔드 200.

## 설계 결정 로그
### Phase 1 — viewport 단일소스 통일 (확정, 저위험)
- listListings/Posts/Biz 를 viewport 모드에서도 visible* 사용하도록 통일. ward fetch 경로(wardListings/Posts/Biz + 이펙트 :581-637) 제거(내 변경으로 생긴 orphan 정리).
- 뱃지: region 이름 라벨은 유지(centerWard.region.name), 건수는 visible 핀 개수로 자동 일치(list*가 visible*가 되면 자연 정합).
- 줌아웃 게이트로 핀 꺼질 때 리스트 빈 상태 → graceful empty/hint("지도를 확대…"). 기존 empty UI 있으면 재사용.
- region(동 선택) 모드 동작 불변.

### 🔴 Phase 2 재설계 (분석 워커 a7c96 결과로 방향 전환 — 아침 검수 1순위)

**결정적 발견: 당근식 캐러셀+pan은 이미 구현돼 있음 (PostPanel.tsx).**
- PostPanel = 가로 scroll-snap 카드 캐러셀 + IntersectionObserver 인덱스감지 → onIndexChange → `focusPointRef.current?.({lat,lng})`로 지도 pan → 핀 `selected` 하이라이트. 거리순 정렬(listingCarousel/feedCarousel/openPostPanel의 d² sort)·피드백루프 방지(suppressPanelRebuildRef)까지 이미 정교.
- SaigonMapV5는 콜백-ref 명령형 API 노출: focusPointRef(순수 pan)/zoomInRef/searchFitRef(fitToPoints)/emitBboxRef.
- 아이템 좌표: Listing.lat/lng+distanceM(서버계산), FeedPost.latitude/longitude, BizMapItem.lat/lng(non-null) 전부 보유. 업체만 실거리(m) 없음(필요시 haversineKm 재사용, market.ts:436).
- 캐러셀 라이브러리 없음(embla/swiper/framer 전무) — 전부 순수 CSS scroll-snap + Pointer Events 수기.
- **현재 트리거: 핀 탭 → openItemPanel → PostPanel 오버레이(postPanelOpen=true면 시트 display:none).** 즉 캐러셀은 "핀 탭 시에만" 뜨는 오버레이이고, 기본 화면은 하단 시트(리스트).

**⚠️ 의도적 반대 결정이 코드에 있음(팀이 일부러 그렇게 짬):**
- 주석 L772-773 "시트 자동 올림 없음 — 시트는 사용자 의도로만 이동".
- 주석 L789-791 "지도-리스트 분리 — listing/feed 핀은 selectedId 미설정".
- 대표 최신 피드백이 이걸 뒤집는 방향(카드가 기본으로 떠야 함). **이 반전은 아침에 도일이 대표 의도 재확인 후 확정할 사항.**

**권장 Phase 2 (최소·가역, 신규 캐러셀 금지):**
- 뷰포트 모드에서 지도 정착(bbox commit) 시 활성탭 아이템이 ≥1개면 **지도 중심에 가장 가까운 아이템으로 기존 PostPanel 캐러셀을 자동 표시**(openItemPanel 기계 재사용). → 대표 "가장 가까운 매물 박스로 띄우고 좌 플리킹, 컨텐츠 기준 이동"을 기본값으로 실현.
- PostPanel 내부·suppress 계약은 **건드리지 않음**. 자동표시가 recenter→bbox→재자동표시 루프를 만들지 않도록 "사용자 팬으로 인한 정착 1회당 1회만, 프로그램적 recenter엔 트리거 안 함" 가드 필수(suppressPanelRebuildRef와 별개 플래그).
- **2a 핀 밀도(클러스터링)**: 신규 구현 안 함. 근거: 카드 중심 브라우징이면 핀은 부차적 + 기존 줌게이트로 광역=district뱃지 처리 + 클러스터링은 "쉽게쉽게" 위배. (의도적 비작업 — 아침에 "2~3개가 핀 자체를 줄이란 뜻"이면 재설계)
- 자동표시가 기존 working 캐러셀/suppress 계약을 깰 위험이 크다고 구현/리뷰에서 판단되면 **커밋하지 말고 되돌린 뒤 설계 제안만 남긴다**(오버나잇 리스크 관리).

## 🟡 커밋 전략 (아침 휴먼체크 필요)
- **오버나잇 중엔 커밋 안 함.** 이유: NeighborhoodMap.tsx에 이 작업 이전부터 미커밋 WIP(2026-07-12 오버레이 전환 등)가 섞여 있고, 의존 파일 PlaceSuggestSheet.tsx/.module.css가 **untracked(HEAD 없음)**. 이 파일 단독 커밋 시 → 무관 WIP ~350줄 혼입 or 빌드깨진 트리.
- Phase1·Phase2 변경은 working tree에 스택으로 남김. 아침에 도일이 WIP 묶음 커밋 전략 확정 후 함께 커밋.
- 검증은 커밋과 무관하게 lint+tsc로 완료.

## 라우팅
- [analysis-dataflow] 완료 — Sonnet.
- [analysis-sheet] 완료 — Sonnet. Phase2 = PostPanel 이미존재 발견 → 재설계.
- [impl-p1] Phase1 소스통일 — qm-implementer(Fable). **상태: 구현 완료(uncommitted). eslint 0err/7warn(pre-existing), tsc 0err.**
- [review-p1] Phase1 교차검증 — qm-reviewer(Sonnet, RO). **상태: PASS.** list*=visible* 확인, ward orphan 완전제거, 뱃지 정합, region 무영향, tsc 0err, eslint 회귀없음(7warn=pre-existing). 비차단 nit 1건: 빈상태 힌트 문구가 "줌아웃"과 "원래없음" 구분 안 함(아침 다듬기 후보).
- [impl-p2] Phase2 PostPanel 자동표시 — qm-implementer(Fable). **상태: 구현완료(uncommitted). eslint exit0(신규 warn1=기존패턴 동일룰), tsc exit0. 실기 런타임 미검증.**
- [review-p2] Phase2 교차검증 — qm-reviewer(Opus, RO, 고위험). **상태: DECISION_NEEDED.** 루프·타입·린트 안전 재확인(실diff 추적): recenter:false→pan없음→재정착없음, postPanelOpen 자기가드, blocked 객체참조 자연해제, suppress 무오염, 핀탭 회귀없음, eslint/tsc exit0. 제품결정 3건 발견 ↓.
- [fix-p2] 자동표시 교정 2건 — qm-implementer(Fable). **상태: 완료(uncommitted). 교정1: markBizAsRead를 recenter!==false 블록 안으로(L784-790). 교정2: switchTab에 autoPanelBlockedBboxRef=null(L1028-1032). eslint/tsc exit0, 신규경고 없음.**
- [review-p2b] 교정 초점 재검증 — qm-reviewer(Sonnet, RO). **상태: PASS.** 교정1·2 의도대로, 무한 재발화 없음, tsc clean. 비차단 nit: 핀탭 직후 500ms 내 탭전환 시 자동표시 1회 조용히 스킵(드묾, 심각도 낮음).

## 🔴 Phase 2 리뷰 발견 + 감독 처리 (아침 확인)
1. **[교정중] biz 자동읽음 → W4 미확인뱃지 훼손**: 자동표시가 markBizAsRead/markBizNewsRead(bizNewsRead.ts:22) 호출 → 팬만 해도 중앙 최근접 업체 소식이 localStorage에 영구 읽음처리. isNewsUnread 뱃지 무력화. → **감독 판단: 명백한 회귀, 자동표시 경로에서 읽음처리 제거(교정1). 명시적 탭/방문만 읽음 유지.**
2. **[교정중] 탭 전환 시 카드 미표출**: blocked가 bbox객체 단위라 탭 바꿔도 안 뜸 → "카드=기본 브라우징 표면" 목표 상충. → **감독 판단: switchTab에서 blocked 리셋(교정2). 목표부합이라 결정 아님.**
3. **[🟠 아침 대표 결정] 자동 말풍선(2026-07-11 대표결정) 대체**: 자동표시가 in-range 말풍선을 사실상 대체(공존은 postPanelOpen 가드). 말풍선 폐기/유지는 대표 확인 필요. → 코드 그대로 두고 문서화만. **이재훈 대표에게 물어볼 것.**
- (정보) 구현자 보고 부정확: PostPanel/SaigonMapV5도 변경돼 있으나 그건 패키지 B/C 무관 WIP. Phase2 자동표시 로직은 NeighborhoodMap.tsx에만 있음(사실).

## impl-p2 변경 요약 (NeighborhoodMap.tsx 단일파일, uncommitted, Phase1 위에 스택)
- 자동표시 = 기존 openPostPanel/openItemPanel 재사용 + `{recenter:false}` (focusPointRef 미호출 → pan 루프 원천차단).
- 신규 가드: `autoPanelBlockedBboxRef`(bbox 객체참조 기반 — 정착1회당1회/dismiss기억/패널발 recenter 커밋 제외), `autoPanelPanPendingRef`(패널발 pan 커밋 승격). suppress 계약·PostPanel 내부·핀탭 경로 무수정.
- 가드: viewport 모드만, region/placePin/postPanelOpen/isSearching/showDistrictBadges면 return.
- 자동표시 이펙트는 말풍선·재검색·줌게이트 이펙트보다 뒤에 선언(같은 flush 최종적용 보장).
- 🔴 리뷰 판단 요망: ①biz 자동표시 시 markBizAsRead 자동읽음(수동탭 없이) ②기본탭 biz라 자동표시가 2026-07-11 대표결정 "자동 말풍선"을 사실상 대체(공존은 postPanelOpen 가드로 처리) ③실기 WebView 미검증.

## impl-p1 변경 요약 (NeighborhoodMap.tsx, uncommitted)
1. listListings/listPosts/listBiz = visible* (모드무관 통일). listLoading=loading, listBizLoading=bizLoading, listError=loadError.
2. orphan 제거: wardListings/wardPosts/wardBiz/wardLoading/wardBizLoading/wardError state 6개 + ward 매물·피드 fetch effect + ward 업체 fetch effect.
3. hasData 단순화: ward 분기 제거.
4. stale 주석 4곳 교정.
5. centerWard(뱃지/제목 라벨)·regionBbox/regionContains(biz핀·클리핑·리뷰작성) 유지.
- ⚠️ 의도된 동작변화(리뷰어 확인): ①리스트가 ward고정 아니라 팬/줌마다 갱신 ②줌아웃 게이트서 리스트도 함께 비어 empty 노출(기존엔 ward리스트 유지됨).

## 진행 상태 (누적)
- 2026-07-14 밤: 스코프 풀코스 확정. Phase1 구현 완료(uncommitted). Phase2 재설계 확정. review-p1 착수.
- TODO(부모세션): index_repository(mode:fast) 재인덱싱 — 코드 변경 반영(서브에이전트 환경엔 MCP 미노출이었음).

================================================================
# ✅ 최종 종합 (2026-07-14 밤 완료) — 아침(07-15) 휴먼체크용
================================================================

## 무엇을 했나 (전부 NeighborhoodMap.tsx 단일 파일, uncommitted, working tree에 스택)
- **Phase 1 (viewport 단일소스 통일)** — 하단 리스트를 ward 쿼리에서 지도핀과 동일한 viewport 소스(visible*)로 통일. ward 조회 경로 완전 제거. 뱃지 N=핀 개수 정합. → 대표 "지도 9 리스트 6" 불일치 근본 해결. **[review PASS]**
- **Phase 2 (당근식 카드 자동표시)** — 기존 PostPanel 캐러셀(이미 플리킹→지도pan 구현돼 있었음)을 **뷰포트 정착 시 최근접 아이템으로 자동 표시**. 신규 캐러셀 안 만듦. recenter:false로 루프 원천차단. 자동읽음 제거(뱃지 보호)·탭전환 카드표출 교정 반영. → 대표 "가장 가까운 매물 박스 띄우고 좌 플리킹, 컨텐츠 기준 이동"을 기본값으로 실현. **[Opus review + 교정 재검증 PASS]**

## 검증 상태 (정직히)
- eslint(대상파일) exit0, tsc --noEmit exit0. 신규 경고 없음.
- ❗ **실기(WebView) 런타임 검증 안 됨** — 이 환경에서 불가. 아침에 앱 띄워 실제 동작 확인 필수.
- 커밋/푸시 안 함(아래 커밋 전략 참조).

## 🔴 아침 체크리스트 (우선순위 순)
1. **[대표 확인] 방향 자체가 맞나** — Phase 2 "카드 자동표시를 기본으로"는 코드에 있던 팀의 의도적 반대결정("시트 자동 올림 없음", "지도-리스트 분리")을 뒤집은 것. 대표 피드백 해석이 맞다고 봤지만 실기로 보여주고 확정받을 것.
2. **[대표 확인] 자동 말풍선(2026-07-11 결정) 폐기/유지** — 자동표시가 in-range 말풍선을 사실상 대체. 말풍선 코드는 안 건드리고 뒀음. 유지할지 제거할지 대표 결정 후 정리.
3. **[대표 확인] "핀 2~3개" 의미** — 나는 "카드 중심 브라우징이면 핀 밀도는 부차적"으로 보고 클러스터링을 신규구현 안 함(줌게이트 유지). 대표가 "지도 핀 자체를 줄여라"였다면 Phase 2a(클러스터링) 재설계 필요.
4. **[실기 검증]** 앱 띄워서: (a)리스트=핀 정합·뱃지 카운트 (b)정착 시 최근접 카드 자동표시 (c)카드 플리킹→지도 pan (d)탭전환 시 새 카드 (e)**팬만 했을 때 업체 미확인뱃지가 안 사라지는지**(교정1 회귀검증) (f)줌아웃 시 리스트 빈 상태.
5. **[커밋]** WIP 묶음 전략 확정 후 Phase1+2 커밋. **push 직전 /code-review 게이트 실행**(고위험 자동표시 로직 포함).
6. **[반영]** 커밋·실기확인 후: codebase-memory 재인덱싱(MCP 재연결 필요) + manage_adr 갱신 + ai-docs/context/frontend-page-map.md 동기화(동네지도 하단 리스트 소스·자동표시 동작 변화).
7. **[선택 polish]** Phase1 빈상태 힌트 문구 "줌아웃"vs"원래없음" 구분 / Phase2 드문 타이밍 자동표시 스킵 — 둘 다 비차단.

## 감독이 자율로 내린 결정 (되돌리려면 여기 근거 참조)
- 커밋 안 함(WIP 얽힘·untracked 의존파일 → 단독커밋 시 무관WIP 혼입 or 빌드깨짐).
- 클러스터링 신규구현 안 함(과설계·"쉽게쉽게" 위배, 카드중심 브라우징으로 핀밀도 부차화).
- biz 자동읽음 제거(명백한 회귀 차단, 명시적 상호작용만 읽음).
- 탭전환 blocked 리셋(목표 "카드=기본표면" 부합).
- 말풍선 코드 미변경(대표 결정사항이라 보류).

## GOAL 상태: 분석→설계→구현 달성 (실기검증·커밋·대표결정 3건은 아침 휴먼 몫). 부모세션 /goal 은 아침 검수까지 유지 권장.

## 🔴🔴 2026-07-15 실기검증 결과: Phase 2 해석 오류 확정 + 신규 버그 3건
- 리빌드로 Phase1+2 **및 기존 미커밋 WIP 전부** 배포됨. "전보다 더 이상해짐".
- **[문제2 = 내 Phase2 오류 확정] 자동으로 떠야 하는 건 '말풍선'인데 '카드 캐러셀'이 자동으로 뜸.** 대표 의도: 자동=말풍선, 카드캐러셀=핀 탭 시에만. 내가 "가장 가까운 박스 자동표시"를 캐러셀로 오해. → **Phase 2 자동표시 전면 롤백.** (image13: 게이트상태서 핀없이 캐러셀+게이트버튼 잔존 심각버그도 롤백으로 해결)
- **[문제1] 카메라 줌 상태 영속화** — 재진입 시 게이트 줌 리셋 안 되고 직전 줌아웃 복원(image12). 우리 Phase1/2는 카메라 영속화 무관 → 기존 WIP or 스냅샷복원 기능(커밋 18794b4 "지도 최종 상태 복원")에서 왔을 가능성. 귀속 규명 필요.
- **[문제3] stale 지역 하이라이트** — 터치 안 했는데 Bến Thành 오렌지 강조 잔존(image14), badge는 Xuân Hòa(=현재 ward)라 centerWard와 불일치 → stale selectedRegion/focus 누수. 귀속 규명 필요.
- 방침: 문제2=즉시 롤백 확정. 문제1·3=우리변경 vs 기존WIP 귀속 규명 후, 우리변경 원인이면 수정/ 기존WIP 원인이면 도일 확인 후 수정(그의 진행중 작업일 수 있음).
- [analysis-bugs] Opus 근인규명+귀속 **완료**.
  - 문제1 줌기억 = 기존커밋 a8a3cb6(뷰포트기억) `initialViewport={savedViewport}`가 게이트초기화보다 우선. 우리 아님. → **도일 결정대기**(콜드진입 게이트리셋 vs 현행).
  - 문제2 자동캐러셀 = **우리 Phase2**. 자동표시 이펙트가 postPanelOpen 자동 true → 말풍선 무력화. → **즉시 롤백**(정밀 라인목록 확보).
  - 문제3 오렌지강조 = 기존 라벨(cf3a4b2, polyActive 가드없음) + focusLatLng의 setSelWard(위치버튼/서비스밖폴백→ben-thanh 하드코딩) 해제경로 부재 + 도일 탭경로만 미완제거. → 라벨에 polyActive 가드 추가로 완성.
- [impl-fix] 문제2 롤백 + 문제3 가드 — qm-implementer(Fable). 상태: 진행중.
- [문제1 결정대기] 도일 product 결정 후 별도 처리.

## 2026-07-14 밤 실기검증 로그(옛빌드 오해)
- 도일 실기중 "피드 탭: 지도 2핀 vs 리스트 0건"(image copy 11) 발견.
- 진단: **실행 앱이 옛 빌드였음.** saigon_frontend 컨테이너 07-13 17:15 기동 vs 소스수정 07-14 01:56 → 미반영. vite dev도 아님.
- "2핀/0건"은 옛 코드의 dual-source 미스매치(피드핀=visiblePosts / 피드카운트=wardPosts) 정확한 증상 = Phase1이 고치는 그 버그. 수정후 코드에선 둘 다 visiblePosts라 재현 불가.
- 조치: 도일 요청으로 `docker compose --env-file .env up --build -d frontend` 리빌드 실행(Phase1+2 함께 배포, 테스트용). 완료 후 실기 재확인 예정.

================================================================
# 2026-07-15 2차 수정 완료 (마운트 복구 후)
================================================================
- /mnt/c 9p 마운트가 한동안 I/O 다운 → 복구됨. 롤백 워커는 중단됐으나 편집은 디스크에 저장됨(검증으로 확인).
- **문제2 (Phase2 자동캐러셀) 롤백 완료·검증**: autoPanel 잔존 0, openPostPanel(biz)/openItemPanel(items,pos) opts 제거·focusPointRef+markBizAsRead 무조건 실행 복원. 자동표시 이펙트 제거. 패키지 C·Phase1 유지. → 자동=말풍선, 카드캐러셀=핀 탭 전용 복원.
- **문제3 (오렌지 지역강조 잔존) 완료·검증**: SaigonMapV5.tsx:942 라벨 렌더에 polyActive 가드 추가(테두리와 일관). viewport 모드서 stale 강조 안 그려짐.
- **문제1 (콜드=게이트리셋) 완료·검증**: NeighborhoodMap.tsx 모듈 플래그 mapSessionEntered 추가. savedViewport 초기화 시 세션 첫 마운트면 null 반환(게이트 진입), 세션 내 재마운트면 loadSavedViewport() 복원. 도일 선택 A(콜드=리셋/세션내=유지) 정확 구현. localStorage 저장은 유지.
- 검증: tsc --noEmit exit0, eslint(2파일) 0 errors/30 warnings(전부 pre-existing).
- 커밋 안 함(WIP 얽힘 지속). 프론트 리빌드로 실기 테스트 배포.
- 남은 것: 도일 실기 재확인(3버그 해소 + Phase1 정합 + 말풍선 정상). 이후 커밋전략·/code-review·ADR·재인덱싱은 여전히 미결.

## 2026-07-15 3차: 파란 dot(내 위치) 폴백 오표시 수정
- 증상: 한국(서비스밖) 유저인데 HCMC 중심에 "내 위치" 파란 dot(image15).
- 원인: 홈 WorldMapV2가 GPS 밖/실패 시 FALLBACK(Bến Thành 10.77,106.70)을 setSharedCoords로 공유(WorldMapV2:223,225) → 동네지도 마운트 initialGps={storedCoords} → SaigonMapV5:387 focusLatLng(FALLBACK) → focusLatLng이 무조건 setMeLatLng(502)라 dot 표출. ◎ runLocate는 서비스밖이면 setMeLatLng(null)로 안 찍는데(567) 마운트 경로엔 그 가드 없던 불일치. **우리 변경 무관, 기존 동작.**
- 수정(도일 승인, 최소·map-only): focusLatLng에 noMeDot 옵션 추가, 마운트 initialGps 포커스(387)에 noMeDot:true → 카메라만 이동, dot 미표출. focusLatLngRef 타입도 갱신. runLocate(실 GPS)는 그대로 dot 표출.
- ⚠️ 트레이드오프: 이 최소수정은 실제 in-area 유저의 "마운트 자동 dot"도 없앰(◎ 누르면 나옴). 실유저 마운트 자동 dot 유지하려면 store에 real/fallback 플래그 추가 필요 — 도일 확인 후 선택.
- 검증: tsc exit0, eslint(SaigonMapV5) 0 errors. 리빌드 배포.
- 문제1(콜드=게이트리셋) 도일 실기 확인 완료(초기 확대 정상). 문제2·3도 확인됨.

## 2026-07-15 4차: Bến Thành 라벨 소실 (문제3 수정의 부작용) 수정
- 증상: 문제3 오렌지 강조 제거 후 Bến Thành 동 라벨이 회색으로도 안 뜸.
- 원인: 라벨 2블록 — A(923, 일반 회색)는 `i===selWard` 건너뜀(B가 그린다 가정), B(945, 오렌지)는 우리가 polyActive 가드 추가. storedCoords 폴백으로 selWard=ben-thanh 고정인데 viewport 모드(polyActive=false)선 B 안 그림 + A 건너뜀 → 라벨 완전 소실. **우리 문제3 수정 부작용.**
- 수정: 블록 A의 selWard 스킵을 `(polyActive && i===selWard)`로 한정. viewport 모드면 그 동도 일반 회색 라벨 정상 표시. (SaigonMapV5.tsx:924)
- 검증: tsc0, eslint 0err. 리빌드 배포.

## 2026-07-15 5차: 핀치줌 중 간헐적 포커스 점프 수정
- 증상: 핀치 확대 중 가끔 지도 포커스가 다른 곳으로 튐(간헐적). 도일 추정: 줌 중 drag 섞임.
- 원인 확정: 핀치(2포인터)→팬(1포인터) 전환 시 pan 기준점 g.lastP 미리셋. 핀치 중엔 lastP 갱신 안 함(줌 분기 먼저 return) → 손가락 하나 떼면 onPointerUp이 lastD만 0으로, lastP는 핀치 시작 시점 stale 값 유지 → 남은 손가락 이동 시 (현재−stale)로 큰 dx/dy 계산 → 점프. 손가락 뗌 타이밍 어긋날 때만이라 간헐적. **우리 세션 변경 무관, 기존 제스처 로직.**
- 수정: onPointerUp에서 g.pts.size===1 되면 남은 포인터 좌표로 g.lastP 리셋(SaigonMapV5.tsx ~752).
- 검증: tsc0, eslint 0err. 리빌드 배포.

================================================================
# 신규 과업 (2026-07-14) — 동네지도 map-marker state consistency
================================================================

## 요청 원문
동네지도 일관성 추가구현 (미구현이지 버그 아님):
1. **선택 강조(selected-state emphasis)**: 업체 핀은 선택 시 큰 teardrop+gear로 강조.
   피드·매물도 선택 아이템 강조해야 함. 매물은 현재 주황 점만 있어 선택 식별 불가.
2. **말풍선 전개(marker callout)**: 업체엔 리치 말풍선(새소식·제목·설명) 있음.
   매물·피드 각각에 어울리는 말풍선 활성화.
3. **매물 카드 캐러셀 레이아웃**: 이미지행↔가격행 사이 죽은 여백. 4안 중 택1:
   1안 상단 스케일↑[사진·제목·정보] / 2안 하단 스케일↑[가격·찜·채팅]
   / 3안 판매자 프로필 row 최상단 추가[avatar·닉네임·평점] / 4안 감독 의견

## 참조 이미지 (/home/doil/workspace/w_dev/saigon_rider/_tmp/)
image copy 17(업체핀 비선택)·18(업체핀 선택+teardrop+"1명이 보는중"+카드)
·19(매물핀 선택-강조없음 갭)·20(업체 말풍선 리치)·21(매물카드 여백갭)

## 명명(Label)
«map-marker state consistency» — selected-state emphasis + marker callout(말풍선)을
업체·피드·매물 3레이어 통일 + 매물 carousel card 레이아웃 정리.

## 라우팅
- A. 코드 매핑(분석) → Sonnet(Explore) — 커버리지 탐색, codebase-memory MCP 1순위.
  **상태: 진행중** (agentId ae65efee...)
- B. ①②③ 구현 → **Sonnet**(qm-implementer, model=sonnet) — 업체에 이미 구현된
  teardrop/말풍선/카드 패턴을 피드·매물로 미러링 + ③ CSS 여백 정리. 창작 아님·패턴 이해 후
  복제라 Sonnet 충분(도일 반박 수용, 07-14). 파일 겹침(SaigonMapV5+카드) 단일워커 순차.
  **상태: 투입** (분석 완료, ③=1안 확정 후)

## 분석 결과 (Sonnet, 코드 확정)
- **마커**: SaigonMapV5.tsx가 SVG 트리에 인라인 렌더. 3레이어 공통 `markers` 배열·렌더루프(:994).
  MapMarkerV2(region.ts:15-34): `selected?`, `kind?:'biz'`. biz만 teardrop(선택시), 나머지 dot.
- **① 갭 원인**: SaigonMapV5.tsx:1050-1084 else분기(dot)에 **선택 링 코드 이미 존재**(:1052-1055,
  r*1.75 주황). 그러나 NeighborhoodMap.tsx 피드·매물 마커 생성부(:629,634,663,669,673)가
  `selected` 미전달. biz는 :643,656,684에서 `selected: focusedBiz?.id===b.id` 전달.
- **② 말풍선**: anchorOverlay prop(SaigonMapV5.tsx:173, 렌더 :1103-1107) = 범용 {lat,lng,node}.
  현재 bizNewsOverlay(NeighborhoodMap.tsx:1073-1095) 하나만, `postPanelOpen?undefined:bizNewsOverlay`(:1402).
  CSS .bizNewsBubble(NeighborhoodMap.module.css:134-187, ::after 꼬리).
  데이터: 매물 ListingCard(market.ts:70-89)=title/priceVnd/district/distanceM. 피드 FeedPost(types.ts:78-100)=caption/nickname.
- **③ 원인**: PostPanel.tsx(카드 3종 공통, renderCard :119-226). .card{height:220px 고정}(PostPanel.module.css:77-83).
  .listingRow{flex:1}(:208~)이 남는 세로공간 흡수 → 여백. .listingThumb 120×120(:226-232).
- **3안 불가 근거**: 지도 카드 ListingCard/MarketplaceListingCard엔 seller 닉네임/아바타/평점 없음.
  SellerBrief(schemas.py:135-144)는 ListingDetail.seller(상세전용)에만. 3안=백엔드 계약변경 선행.

## ③ 결정: **1안 확정** (도일, 07-14) — CSS only, 균일높이 유지, 백엔드 무관.

## 구현 1차 결과 (Sonnet qm-implementer, uncommitted)
- **① 완료·정확**: 선택 state=`focusedItem`(postPanelOpen?carouselItems[carouselIndex]:null).
  focusedListing/focusedFeedPost 미러(NeighborhoodMap.tsx ~244) → 매물·피드 마커 4곳 `selected`
  전달 + markers useMemo deps 추가. SaigonMapV5 무수정(dot 링 :1052-1055 재사용). image19 정조준.
- **③ 완료**: PostPanel.module.css .listingThumb 120→150 정사각, .listingDescription clamp 2→3.
  .card/.listingRow/업체·피드 클래스 무수정.
- **② 1차 결함(워커 자진신고) → 교정 중**: listing/feed overlay를 focusedItem에서 파생시킴.
  그런데 focusedItem은 패널 열림 시만 non-null인데 anchorOverlay 삼항은 패널 열리면 말풍선 숨김
  → 영원히 안 뜸. biz 말풍선은 selectedBiz(패널 닫힘 중 근접-자동강조, focusedBiz와 별개 state)로
  구동됨. 감독 지시오류("auto-select 금지"의 대상은 카드캐러셀 자동오픈뿐이었음) → 교정 재투입:
  selectedBiz 근접-자동강조 이펙트를 매물·피드로 미러링해 selectedListing/selectedPost 생성,
  overlay를 거기서 파생. **상태: 교정 진행중.**
- 검증(1차): tsc exit0, eslint(NeighborhoodMap/PostPanel) 새 경고 0(baseline 7 동일). CSS lint 없음(skip).
- 커밋·리빌드 안 함.

## ② 교정 완료 (Sonnet qm-implementer, uncommitted)
- selectedBiz 메커니즘 규명: state(~220)+selectedBizRef(~841)+근접-자동강조 이펙트(~843-874).
  패널 닫힘 중 bboxFilter 중심 최근접 visibleBiz를 AUTO_BUBBLE_CENTER_RADIUS 내면 selectedBiz+
  selectedId 설정+scrollItemIntoList. **카메라 이동 없음.** 가드: tab!=='biz', isSearching, !bboxFilter
  (뷰포트모드), postPanelOpen, latSpan>AUTO_BUBBLE_MAX_LAT_SPAN 줌게이트, biz전용 suppressAutoBubbleIdRef.
- 미러: selectedListing/selectedPost state(~222-223)+refs+동기이펙트+근접이펙트 2개(~876-941).
  biz 이펙트 구조 복제, 데이터만 교체(Listing .lat/.lng / FeedPost .latitude/.longitude, null좌표 skip).
  동일 가드. clear 경로도 미러(줌게이트·switchTab·resetToViewport·openItemPanel·onMapTap).
- overlay 파생 변경: listingOverlay←selectedListing, feedOverlay←selectedPost(focusedItem 제거). deps 갱신.
  anchorOverlay 삼항 그대로. ①(focusedListing/focusedFeedPost→마커 selected)·③ 무수정.
- 워커 신고 gap: (a)suppressAutoBubbleIdRef 미러 생략(biz는 [X]닫기 후 재팝 억제용, 매물·피드는
  핀탭→패널열림 가드로 불필요 판단) (b)setSelectedId 공유하나 탭게이트+switchTab리셋으로 경합無.
- 검증: tsc exit0, eslint exit0 새 경고 0(baseline 7, +4라인 시프트만).

## 교차검증 [review-② Sonnet RO] — **판정: CHANGES**
- ①③ 정확 확인. ② 가드·clear·루프안전 완벽 미러 확인.
- **[MAJOR] close-suppress 누락**: openItemPanel(:745)이 focusPointRef로 recenter → 패널 [X] 닫으면
  지도중심이 방금 닫은 아이템과 일치 → 근접판정 즉시 재점화 → 방금 닫은 말풍선 재등장.
  biz는 suppressAutoBubbleIdRef(:865)로 막는데 매물·피드 누락. 워커 주석(:880-881) 틀림(recenter 놓침).
- [MINOR] openPostPanel(:772-783) selectedListing/Post 미클리어 비대칭 — 현재 무해, 선택.
- setSelectedId 공유 gap = 실문제 아님(탭UI 검색중 숨김·searchScope 고정).

## [fix-② MAJOR] close-suppress 미러 — qm-implementer(Sonnet) **상태: 완료(uncommitted)**
- 신규 ref 2개(~241-244): suppressAutoBubbleListingIdRef/FeedIdRef.
- set: closePostPanel(~790-793) 3ref 모두 focused*?.id로 기록(biz 무조건 리셋 미러).
- check: 매물 이펙트(~909)·피드 이펙트(~940) 근접판정 앞 `if(best.id===suppress...Ref.current)return;`.
- **clear: handleBboxChange 2경로(즉시/reset ~443-444, 디바운스 ~456-457) 모두 =null** — biz와 동일
  "새 bbox 커밋 시 해제" 규칙. 영구억제 역버그 없음.
- MINOR 적용: openPostPanel(~780-781)도 selectedListing/Post 클리어(openItemPanel과 대칭).
- 검증: tsc exit0, eslint 새 경고 0(baseline 2 refs+5 set-state-in-effect 동일).

================================================================
# ✅ 최종 종합 — 동네지도 map-marker state consistency (2026-07-14)
================================================================
## 완료 (전부 uncommitted, working tree 스택)
- **① 선택 강조**: focusedItem→focusedListing/focusedFeedPost→매물·피드 마커 selected prop.
  SaigonMapV5 기존 dot 링 재사용(무변경). [review PASS]
- **② 말풍선**: selectedBiz 근접-자동강조 이펙트를 매물·피드로 미러(가드·clear·suppress 전부).
  listingOverlay/feedOverlay←selectedListing/selectedPost, anchorOverlay 탭 멀티플렉싱.
  [review CHANGES→MAJOR(close-suppress) 수정 완료]
- **③ 카드여백(1안)**: PostPanel.module.css .listingThumb 120→150 정사각, 설명 clamp 2→3.
  공용 .card 높이·업체/피드 클래스 무침범. [review PASS]
- 변경 파일: NeighborhoodMap.tsx(①②), PostPanel.module.css(③). SaigonMapV5 무변경.

## 검증 상태 (정직히)
- tsc --noEmit exit0, eslint 새 경고 0(pre-existing baseline만).
- ❗ **실기(WebView) 미검증** — 이 환경 불가. 리빌드 후 실제 동작 확인 필요.
- 커밋·리빌드 안 함(기존 WIP 얽힘 지속 — 위 정합성 작업 미커밋분과 같은 파일).

## 🔴 사람 체크리스트
1. 리빌드 후 실기: (a)매물·피드 핀 탭 시 해당 아이템 강조링 (b)매물·피드 말풍선이 업체처럼 뜸
   (c)패널 [X] 닫은 직후 같은 아이템 말풍선 재등장 안 함(fix-② 회귀검증) (d)팬 후 재방문 시 재등장 정상
   (e)매물 카드 여백 사라짐.
2. 커밋 전략: 이 변경도 기존 정합성 WIP와 얽혀 있음. 묶음 커밋 시 함께.
3. push 직전 /code-review 게이트.
4. ②는 "업체 자동 말풍선(2026-07-11 결정)"을 매물·피드로 확장한 것 — 대표 의도와 부합하는지
   실기로 확인(자동 말풍선 UX가 3레이어 다 뜨는 게 과하지 않은지).


## 검증 가능한 목표(goal)
피드·매물 핀 선택 시 시각 강조 + 매물·피드 말풍선 표출 + 매물 카드 여백 제거.
프론트 빌드 통과 + lint 회귀 0.

## ⚠️ 주의 — 위 정합성 작업의 미커밋 WIP가 working tree에 스택돼 있음
SaigonMapV5.tsx / NeighborhoodMap.tsx / PostPanel.tsx 등에 이전 작업 uncommitted
변경 존재. 이 신규 과업 구현 시 그 WIP와 겹칠 수 있으니 surgical하게 해당 라인만 수정.


================================================================
# 디자인 보강 라운드 (2026-07-14, 실기 확인 후)
================================================================
실기 작동 확인됨. 디자인 2건 (도일 결정):
- **A 말풍선 리치화**: 피드=아바타+닉네임+캡션+사진썸네일 / 매물=썸네일+제목+가격.
  말풍선은 HTML 오버레이라 <AppImage>로. .bizNewsBubble 무수정, 새 modifier 클래스.
- **B teardrop 승격**: 피드·매물 selected 시 dot+링 → biz처럼 teardrop+도메인 글리프
  (피드=글/말풍선, 매물=가격표). kind 유니온 'biz'|'listing'|'feed' 확장. SVG 글리프(AppImage 우회 회피).
  SaigonMapV5.tsx(이번 라운드 첫 변경)+NeighborhoodMap+region.ts.
- 라우팅: Sonnet 구현자(같은 워커 재개) — 도일 방침(Fable 과함, 미러링이라 Sonnet 충분).
  감독이 디자인 스펙 세밀 명시로 취향 의존 축소. 구현 후 Sonnet RO 리뷰 → 리빌드.
- 상태: [impl-design] 진행중.

## [impl-design] 완료 (Sonnet, uncommitted)
- B: region.ts:33 kind 'biz'|'listing'|'feed' 확장. NeighborhoodMap 마커 5곳 kind 세팅(:647,652,681,687,691).
  SaigonMapV5.tsx: 새 분기(1056-1073) selected listing/feed → BIZ_PIN_PATH teardrop + 글리프
  (LISTING_GLYPH=local_offer 태그, FEED_GLYPH=chat, :59-60 Material 24×24 인라인 path). biz분기·비선택dot 무변경.
  기존 주황링 dead화됐으나 공유컴포넌트 계약이라 주석만 갱신·보존.
- A: listing/feedOverlay에 <AppImage> 썸네일(.richThumb 44px)+아바타(.feedBubbleAvatar 20px circle).
  새 클래스 .richBubble/.richThumb/.richText/.feedBubbleHead/.feedBubbleAvatar/.feedBubbleName.
  .bizNewsBubble+::after 무수정(업체 회귀 없음 확인). 썸네일 없으면 생략.
- 검증: tsc exit0, eslint 0 error(no-direct-img 위반 0), 새 경고 0.
- 감독 판단: 리뷰어 생략(순수 렌더+CSS, 이펙트/루프 없음 → 로직리스크 낮고 시각검증이 우선). 리빌드→실기.
- 리빌드: docker compose up --build -d frontend 실행.

================================================================
# 신규 과업 (2026-07-15) — 동네지도 탭순서·말풍선이벤트·POI
================================================================

## 요청 원문
[동네지도]에서
1. 바텀시트의 탭 순서를 [매물, 피드, 업체]로 변경.
2. 말풍선 터치 시 상세페이지로 이동하지 말고, 카드 캐러셀 표출되도록 이벤트 변경.
3. 중요지점 POI 수집 및 표출 (데이터 수집 방식, 표출 방식 논의, 구현) 각각 필요.
3번을 어떻게 할지 확정짓고 순차적으로 진행. 1→2→3 순서. **지금은 내용 논의만 먼저.**

## 명명 (Terminology)
- 1번 = tab reordering
- 2번 = marker callout(말풍선) interaction remapping — auto-bubble onClick: navigate→card carousel
- 3번 = POI ingestion & rendering (수집 파이프라인 + 지도 표출)

## 분석 결과 (analysis-nmap, Sonnet, 코드 확정)
- **1번**: 탭 순서 배열 `['biz','feed','listings']` @ NeighborhoodMap.tsx:1288 → 렌더 업체→피드→매물.
  탭 라벨 i18n(tabListings=매물/tabFeed=피드/tabBiz=업체). 기본탭 useState<Tab>('biz') @:190.
- **2번 (핵심 발견)**: 핀(teardrop) 탭은 **이미** PostPanel 카드 캐러셀을 연다(navigate 아님).
  상세 navigate는 두 곳: (a) **자동 말풍선(auto-bubble)** 클릭 @:1179 /biz, :1204 /market, :1227 /feed,
  (b) PostPanel 카드 탭 @:1787. 사용자가 말한 "말풍선"=auto-bubble → 이걸 navigate 대신 캐러셀 오픈으로.
- **3번**: 지도 화면과 연결된 POI 개념 **없음**(코드/DB). engine 미션seed에만 geo poi 필터 문자열 존재(무관).
- 카드 캐러셀=PostPanel.tsx(이미 존재, 신규 불필요). openItemPanel/openPostPanel 기계 재사용 가능.

## 논의 확정 (2026-07-15, 사용자 결정 완료)
- **1번**: 탭 순서 [매물,피드,업체] + **기본탭 매물**로 변경(useState('biz')→('listings')).
- **2번**: "말풍선"=auto-bubble 확정. auto-bubble onClick의 navigate(/biz·/market·/feed)를
  → 핀 탭과 동일한 openItemPanel/openPostPanel(카드 캐러셀 오픈)으로 리매핑. 핀 탭 경로 불변.
- **3번 POI (확정 스펙, 2026-07-15 범위 축소)**:
  - 정의: **2카테고리** — ①지형/랜드마크 ②행정/생활 인프라.
    - ❌ 라이더 실용(정비소/주유소/충전소) = **업체(biz) 도메인**으로 귀속(POI 아님).
    - ❌ 침수구역 = 동네지도 제외.
    - → POI = 상업콘텐츠와 분리된 순수 위치 참조 레이어(랜드마크·관공서 등 기준점).
  - 수집: **관리자 수동 등록 + 에이전트 인제스천**(실서비스, MVP 아님). 정교한 API 핵심.
  - 표출: **상시 참조 레이어 + 카테고리별 아이콘**(탭 배타 무관, 매물/피드/업체 위에 항상).
- **3번 세부 결정 확정 (2026-07-15)**:
  - i18n: POI 이름 **ko·vi·en 다국어**(business_category 라벨 패턴), 설명은 단일 TEXT(선택).
  - 승인: **에이전트 직접 게시** — draft 게이트 없음. `published BOOLEAN default true`, 관리자 사후 숨김/수정/삭제.
  - 관리자 화면: **목록+편집+게시(숨김토글)+수기신규 중심**. API가 주, 화면은 관리 보조.
  - 마커 탭 동작: **이름 라벨만**(팝업·캐러셀·상세 없음 → 프론트 단순).
  - 아이콘: 카테고리 고정 SVG(poiCategoryIcons.ts, biz 미러).

## biz 레퍼런스 분석 (Sonnet, 코드 확정) — POI 미러 대상
- BFF 도메인(backend/). 마이그레이션=database/init/NNN_*.sql 순번파일(멱등 upsert), alembic 아님.
- business_profile: Numeric(9,6) lat/lng(PostGIS 미사용), category FK business_category(code+ko/vi/en+icon),
  photo_content_id FK contents, status 상태머신. 인덱스: user/status(bbox 인덱스 없음).
- /biz/public/map(biz.py:356-396): bbox range where + category/q(ILIKE) + LIMIT200, BizMapItemOut(schemas.py:1347).
- contents: *_content_id FK + build_imgproxy_url(utils.py:56). 업로드 POST /contents.
- 쓰기: 유저 apply(verify_user_session) + 관리자 승인(admin.py, verify_admin_session 쿠키). **관리자 신규생성 UI 없음**.
- 시드: SQL init upsert(117_biz_profile_map_seed.sql 등). 마커=카테고리 SVG(bizCategoryIcons.ts), 사진 아님.
- i18n: 업체명 단일, 카테고리 라벨만 ko/vi/en.

## POI 최종 설계 (biz 미러)
```
poi 테이블 (신규 database/init/1XX_poi.sql)
  id UUID PK / category VARCHAR(60) FK poi_category.code
  name_ko(NOT NULL)·name_vi·name_en / description TEXT(nullable)
  address VARCHAR(200) / latitude·longitude NUMERIC(9,6) NOT NULL
  photo_content_id UUID FK contents ON DELETE SET NULL (nullable)
  source VARCHAR(60) / external_ref VARCHAR(200) (nullable)
  published BOOLEAN NOT NULL DEFAULT true / sort_order INT / created_at·updated_at
  partial UNIQUE(source, external_ref) WHERE external_ref IS NOT NULL  ← upsert 키
poi_category (business_category 미러): code PK + label_ko/vi/en + icon + sort_order + is_active
  seed: landmark(지형·랜드마크), civic(행정·생활)
읽기 API: GET /poi/public/map?min_lat&max_lat&min_lng&max_lng&category&q (published=true, LIMIT200)
  → POIMapItemOut{id,category,name_ko/vi/en,address,lat,lng,photo_url}
쓰기 API(Phase B): POST /admin/poi/bulk upsert(external_ref 키), 관리자 세션
관리자(Phase B): /admin/poi 목록+편집+게시토글+수기신규
프론트: poiCategoryIcons.ts + SaigonMapV5 kind:'poi' 상시 레이어(탭무관) + 이름 라벨
```

## Phase 분할 (순차, 병행 안 함)
- **Phase A (read path)**: poi/poi_category 테이블+seed 몇건 → GET /poi/public/map → 프론트 상시레이어+이름라벨.
  "지도에 뜨는 것" 확정.
  - A-1: DB+백엔드 (sonnet, biz 미러). **상태: 완료·검증(uncommitted).**
    - 파일: database/init/124_poi.sql(신규, poi_category 2 + poi 5 seed, 멱등), models.py(+PoiCategory/Poi),
      schemas.py(+POIMapItemOut), routers/poi.py(신규 GET /poi/public/map), main.py(라우터 등록).
    - 서비스명: postgres=`database`(saigon_db, db=saigon_rider, user=wellconn, profile:backend), bff=`bff`(saigon_bff).
    - 검증: SQL 적용(멱등 재실행 확인) + bff 리빌드(healthy) + curl 5건 반환·category/q 필터 정상. 커밋 안 함.
    - ⚠️ init SQL 은 빈 DB 최초기동만 자동실행 → 기존 DB엔 수동 psql 적용 필요(운영 배포 시 유의).
    - **API 응답형(A-2 소비)**: GET /api/bff/poi/public/map → JSON배열
      {id, category:'landmark'|'civic', name_ko, name_vi|null, name_en|null, address|null,
       lat(Decimal문자열), lng(Decimal문자열), photo_url|null}. lat/lng 프론트 Number() 변환 필요.
  - A-2: 프론트 상시레이어+이름라벨 (sonnet). **상태: 완료·리뷰 PASS(uncommitted).**
    - 신규: api/poi.ts(fetchPoiMapItems, lat/lng Number변환), poiCategoryIcons.ts(landmark=flag/civic=account_balance).
    - 수정: region.ts(kind+'poi'), SaigonMapV5.tsx(kind==='poi' 분기 ~L1055: 무채색 rounded-rect #94a3b8,
      selected 시만 이름 라벨<text>), NeighborhoodMap.tsx(poiItems/selectedPoiId state, 탭무관 POI fetch 이펙트,
      markers useMemo 3 return경로 전부 ...poiMarkers append, onMapTap 클리어).
    - POI 마커 시각: biz(원형/teardrop)와 구분되게 슬레이트그레이 사각형. 탭=라벨 토글(재탭 숨김), 팝업/캐러셀 없음.
    - selectedPoiId 기존 selection·auto-bubble·PostPanel 기계장치와 완전 독립.
    - [review-A2] qm-reviewer(Sonnet,RO) **PASS**: 3경로 append·탭배타 무회귀·selection독립·줌게이트(biz미러)·
      언어폴백 확인. tsc 0err, eslint 0err(+4warn=biz미러 동종). 프론트 리빌드·기동 성공.
    - 🟡 비차단 nit(제품결정): 줌게이트 이탈 시 selectedPoiId 미클리어 → 같은 좌표 재줌인 시 이전 탭한 POI
      라벨이 재탭 없이 재현될 수 있음. "탭 시에만 라벨" 결정과 살짝 어긋남. 1줄 수정 가능(gate-exit cleanup에
      setSelectedPoiId(null) 추가). **도일 결정 대기.**
    - ⚠️ 실기 시각확인(마커 색/모양) 미수행 — 사람 몫.
  - **A-2 실기 피드백 (도일, image29)**: 1·2번 정상 확인됨(탭순서·자동말풍선→카드). POI 마커 디자인 미흡:
    ①라벨 항상표시(탭토글 제거) ②마커 너무 작음 ③랜드마크는 위치파악 표식이라 콘텐츠 핀보다 크고 강조돼야.
  - **A-2b POI 마커 디자인 보강** — Fable(시각 디자인 품질). 라벨 상시+마커 확대·강조, selectedPoiId 토글 제거(라벨상시화로 고아→정리). biz/listing/feed·auto-bubble·캐러셀 무침범. 리뷰어 생략(순수 렌더/스타일)→리빌드 실기확인. 상태: 투입.
- **Phase B (write path)**: 에이전트 인제스천 bulk upsert API + 관리자 화면(목록/편집/게시토글/수기신규).

## Phase B 착수 — HCMC 전역 주요 POI 인제스천 (2026-07-15, 도일 확정)
- 결정: 좌표=**OSM 실좌표**(LLM 좌표 환각 위험 배제) / 등록=**bulk 인제스천 API부터 구축** / 범위=**랜드마크+행정생활 폭넓게 ~100+건 HCMC 전역**.
- **인제스천 JSON 계약(양 워커 공유)**: `{items:[{category:'landmark'|'civic', name_ko, name_vi|null, name_en|null,
  description|null, address|null, lat:number, lng:number, source:'osm', external_ref:'osm/{type}/{id}'}]}`
- 워커:
  - [B-1 bulk API] sonnet — POST /admin/poi/bulk upsert. **상태: 완료·검증(uncommitted).**
    - 파일: schemas.py(+POIBulkItem/Request/Result), admin.py(+엔드포인트, admin.router에 있음).
    - ⚠️ **라우트 = `/admin/poi/bulk`** (nginx /admin/ 직결, `/api/bff/` 아님! admin.router는 prefix /api 없음).
    - 인증: verify_admin_session 쿠키. **dev 로그인**: `curl -X POST localhost:18090/admin/login -d 'username=admin&password=admin123' -c cookies.txt` → 이후 `-b cookies.txt`.
    - upsert 멱등 검증(inserted/updated/skipped, category 미존재 skip). published=true 직접게시. 테스트행 정리. 커밋 안 함.
  - [B-data OSM] sonnet(general-purpose) — Overpass HCMC 주요 POI 수집→JSON(scratchpad/poi_hcmc.json). 상태: 진행중.
  - [B-data OSM] **완료**: 97건(landmark 49/civic 48), OSM 실좌표, notability=wikidata/wikipedia로 강화(잡다 동사무소·소형사원 배제). name_ko 대부분 en/vi 폴백(name:ko 9건뿐). Landmark 81은 OSM명이 'Vincom Center'라 워커가 name 오버라이드(투명 기록). scratchpad/poi_hcmc.json.
  - [B-ingest] **완료·검증(감독 직접)**: 로그인→POST /admin/poi/bulk → inserted 97/skipped 0. placeholder seed 5건(source='seed') 삭제. 최종 poi 테이블 = osm 97건(civic48/landmark49). /poi/public/map 광역 bbox 97건 반환, 좌표 스팟체크 정상(독립궁·벤탄·구찌터널·사이공동물원 등). **프론트 리빌드 불필요**(기존 POI 레이어가 API 자동소비 → 앱 새로고침만).
- 관리자 화면(목록/편집/게시토글/수기신규)은 **미착수**(다음 단계). 
- 🟡 후속 검토: POI fetch 줌게이트(biz 미러)가 광역 줌에서 POI 숨김 → "위치파악 표식" 목적상 랜드마크는 더 넓은 줌에서 보여야 할 수도. 실기 확인 후 판단.

## 구현 순서 (사용자 확정 2026-07-15)
- **1·2번 먼저 구현 → 3번은 그다음 별도 논의**(3번은 phase 나뉨, 병행 안 함, 순차).
- 3번 관점(사용자): **실서비스**(MVP 아님). 관리자 등록 화면 + **에이전트가 수집·등록 가능한
  정교한 API**가 핵심(사람 관리 편의 + agent-driven ingestion 양쪽 고려). → API 설계 우선.
- 위 3번 세부 (a)~(d)는 3번 논의 재개 시점에 이 관점으로 확정.

## [impl-1-2] 1·2번 구현 — qm-implementer(Sonnet), NeighborhoodMap.tsx 단일파일
- 1번: 탭배열 ['biz','feed','listings']→['listings','feed','biz'] + 기본탭 'biz'→'listings'.
- 2번: auto-bubble onClick navigate(/biz·/market·/feed) → 핀탭과 동일 open*(카드 캐러셀).
- surgical + 커밋 금지(WIP 얽힘). 검증 tsc+eslint. **상태: 구현완료(uncommitted).**
- 변경(NeighborhoodMap.tsx): ①L190 기본탭 'biz'→'listings', L1288 배열 ['listings','feed','biz']
  (WIP가 임시 역전시켜놨던 걸 되돌림 → HEAD와 동일해 git diff엔 안 나타나나 실내용 정상).
  ②L1179 biz말풍선 navigate→handleBizMarkerClick(selectedBiz), L1204 openListingPanel(l),
  L1227 openFeedPanel(p). 핀탭과 동일 함수·인자·recenter. navigate import 유지(타처 사용).
  listing/feed overlay useMemo에 eslint-disable 2곳(biz 기존패턴 미러).
- [review-1-2] qm-reviewer(Sonnet,RO) **PASS**: 탭순서/기본탭·인자일치·navigate잔존0·핀탭무회귀·
  tsc 0err·eslint 7warn(baseline동일). 비차단 nit: 말풍선 useMemo의 navigate/location deps가
  이제 무의미(기존 biz 패턴 그대로라 범위밖, 추후 정리대상).
- 커밋·리빌드 안 함. 실기(WebView) 미검증.
- 📌 **ADR/page-map 동기화 = PENDING** (커밋+실기검증 후 수행). 이유: 미커밋·미검증 상태 선갱신은
  롤백 시 실제와 어긋남(직전 과업 Phase2 실기 롤백 선례). 동기화 대상 변화: ①동네지도 탭 순서
  [매물,피드,업체]+기본탭 매물 ②자동 말풍선 클릭 = 상세이동→카드 캐러셀 오픈.

## 라우팅 계획
- analysis-nmap: Sonnet — 완료.
- 1번 구현: haiku/sonnet (상수 재배치+기본탭).
- 2번 구현: sonnet (기존 openItemPanel 재사용 이벤트 리매핑).
- 3번 구현: 확정 후 결정 (수집=백엔드 로직=opus/fable, 표출=프론트).

================================================================
# 신규 과업 (2026-07-15) — 베트남 B2B 쿠폰 아그리게이터 제휴 (market-entry structuring)
================================================================
※ 코드 아님. 시장진입·계약 자문. codebase-memory MCP 미사용.

## 요청 원문
개발자 유저가 베트남에서 Saigon Rider 런칭 + voucher aggregator 제휴 원함. 1안=파트너십으로
쿠폰 직접발급(베스트), 2안(백업)=사전구매 후 QR 발급. 1안 진행. 계약/법인 지식 전무.
"어떻게 진행? 다음 단계? 베트남 법인 차려야 하나?" 조언 요청.
- 참고: .orca/drops/B2B쿠폰통합-업무요청서.docx(2026-05-18 상세 브리프), docs/2026-07-15.md(컨택·이메일).
- 현지 연락책 있음. 베트남 법인 없음.

## 표준용어
market-entry structuring + B2B voucher-aggregator partnership sourcing.

## 유저 답변 (블로킹 질문)
- Q1 계약주체: **아직 무등록. 아그리게이터가 요구하는 계약주체를 확인해서 거기 맞춰 준비할 계획.** → 컨택 먼저.
- Q2 현지 연락책: **현재 통역·소개만(프리랜서). 자리잡으면 동업/베트남 지부 공동설립 의향.**

## 라우팅
- W1 사실검증 리서치 → Sonnet(general-purpose+WebSearch). agentId a0ff7c75d3adfd9fc. 상태: 진행중(백그라운드).
- 종합·조언 → 감독(Opus) 인라인.

## 감독 판단 (Simplicity First pushback)
컨택(무료) 먼저 → 아그리게이터 답변으로 계약주체 확정 → 그 후에만 법인/BPO 지출. 유저 의도와 일치.

## 다음
- W1 결과 도착 → 개발자용 실행 로드맵 종합 보고. **[완료]**

## W1 사실검증 결과 (Sonnet, 27소스, 2026 기준) — 요약
- ✅ 한국법인 국경간 B2B계약 OK(베트남 법인 불필요). 진짜 현지 대리인/리셀러도 OK.
- ⚠️ 연락사무소(RO)=계약 불가(매출금지). 🚫 명의대여(nominee)=베트남 법원 무효, 절대 금지.
- Got It/UrBox 2026 활발, Got It 공개 Biz API 있음. **외국 스타트업 온보딩 공개사례 0건 → 직접 확인 필수.**
- 교정: 외국인 LLC 실제 $2,500~5,000/2~4개월(문서 과소). 자본금 ~$15k대.
- 🔴 신규리스크1: 국경간 결제 FCT 원천징수 2~10%(2026.3 강화) → 쿠폰 마진 반영 필수.
- 🔴 신규리스크2(최중요): GOLD가 stored-value처럼 동작 시 e-wallet 분류 → 자본금 500억VND(~$2M).
  회피=순수 설계결정: 양도불가(이미 됨)+즉시 closed-loop 소진+현금환급/유저간이전 금지. 변호사 1회 확인 권장.
- 기타: 판촉등록(MOIT 5일전), 개인정보 Decree13/2023 = 운영단계 이슈.

## 최종 조언 (전달 완료)
이번주 3가지만: ①연락책이 Got It 전화(법인필요? 형태? 바우처 법적분류? 담당자메일) ②영어 1-pager
③GOLD 설계원칙 고정. 법인/BPO/변호사 지출은 컨택 Yes 후로 전부 연기.

## Plane 티켓 발행 완료 (2026-07-15) — SoT
- 라벨 `b2b` 생성. 마일스톤+Phase7 발행(모두 b2b 라벨):
  - SGR-328 [B2B] 🎯 마일스톤(전체 추적, 검증된 리서치 근거 본문 포함)
  - SGR-329 [B2B-0] 이번주 무료액션(컨택·1-pager·GOLD원칙) [Todo/High]
  - SGR-330 [B2B-1] 미팅→계약주체 요구사항 확인 [High]
  - SGR-331 [B2B-2] 계약주체·법적구조 확정+FCT [High]
  - SGR-332 [B2B-3] 계약체결(NDA→본계약)
  - SGR-333 [B2B-4] 규제·컴플라이언스(e-wallet회피·판촉등록·개인정보) [High]
  - SGR-334 [B2B-5] 기술통합
  - SGR-335 [B2B-6] 시드10+베타100→출시
- **SGR-329~335는 SGR-328의 실제 sub-issue로 배선됨**(parent 필드, 검증 완료). 마일스톤에서 진행률 집계.
- **SGR-329~335는 SGR-328의 실제 sub-issue로 배선됨**(parent 필드, 검증 완료). 마일스톤에서 진행률 집계.
- Plane: https://plane.doil.me/doil (project 53da5691...). 인증 x-api-key(.env PLANE_API_KEY).

## 상태: 자문 전달 + Plane 티켓 발행 완료. 이후 진행은 Plane SGR-328~335가 SoT.
