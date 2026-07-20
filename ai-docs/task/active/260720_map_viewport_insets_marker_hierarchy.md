# 동네지도 — 검색범위(query bbox) 인셋 + 업체/POI 마커 스케일 위계 조사

- 상태: 조사 완료, 미착수(문서만)
- 조사자: Sonnet 서브에이전트 (탐색/문서 정리 성격 — 코드 판단은 회귀위험 서술 중심, 구현 배분은 doil 판단)
- 범위: read-only 조사 + 웹 레퍼런스. **코드 미수정.**
- 관련 파일: `frontend/src/pages/map/NeighborhoodMap.tsx`, `frontend/src/components/maps/SaigonMapV5.tsx`, `frontend/src/components/maps/v2/labelDeclutter.ts`, `frontend/src/components/ride/DraggableSheet.tsx`

---

## §1. 현행 검색범위(query bbox) / 리스트 / 카운트 흐름

### 1.1 bbox의 출발점 — SaigonMapV5가 emit하는 것은 "전체 뷰포트"

`SaigonMapV5.tsx:525-551` `onViewportChange()`:

```ts
if (!suppressBbox) {
  onBboxChange?.({
    N: uy2lat(vb.y),
    S: uy2lat(vb.y + vb.h),
    W: ux2lng(vb.x),
    E: ux2lng(vb.x + vb.w),
  });
}
```

`vb`는 SVG `viewBox` 그 자체 — **컨테이너(지도 stage) 전체 사각형**을 좌표 변환한 값이다. 상단 크롬(검색바+카테고리칩)이나 하단 크롬(바텀시트 peek)을 전혀 빼지 않는다. 이 콜백은 `NeighborhoodMap.tsx:445` `handleBboxChange`로 연결되고, 500ms 디바운스 후 `setViewportBbox(bbox)` → `bboxFilter = viewportBbox`(`NeighborhoodMap.tsx:482`)가 된다.

### 1.2 bboxFilter가 쓰이는 3곳 — fetch, 클라이언트 필터, 카운트가 전부 같은 값

- **fetch**: 업체는 `NeighborhoodMap.tsx:589-596` `fetchBizMapItems({minLat: bbox.S, maxLat: bbox.N, ...})`, 매물/피드는 `:550-559`, POI는 `:609`.
- **클라이언트 재필터**: `visibleBiz`(`:639-650`)·`visibleListings`(`:615-625`)·`visiblePosts`(`:627-637`)가 fetch 결과를 다시 같은 `bboxFilter`로 자른다 (팬 도중 stale 데이터 방어).
- **카운트("N건")**: `NeighborhoodMap.tsx:1188-1197` — `listBiz = visibleBiz`, `visibleCount = listBiz.length`(biz 탭). 즉 헤더 "N건"과 지도 핀 배열(`markers`, `:727-739`)이 **동일한 `visibleBiz` 소스**를 쓴다 — 리스트/카운트/핀 사이 불일치는 없다. 문제는 이 셋이 전부 "화면에 실제로 보이는 사각형"이 아니라 "크롬을 포함한 컨테이너 전체 사각형"을 기준으로 한다는 점이다.

**결론(§1 한 줄)**: 현재 쿼리/카운트 bbox는 **전체 뷰포트**(크롬 포함 컨테이너 사각형)이고, 크롬을 뺀 "가시 지도 사각형"으로 한정하는 경로는 없다.

### 1.3 크롬 인셋 값 — 이미 존재하고 이미 SaigonMapV5까지 전달됨(단, bbox 계산엔 미사용)

`NeighborhoodMap.tsx:1601-1602`:
```tsx
bottomInsetPx={postPanelOpen ? postPanelHeight : sheetVisibleHeight}
topInsetPx={tab === 'biz' && !isSearching ? SEARCH_BAR_HEIGHT + CATEGORY_CHIPS_HEIGHT : SEARCH_BAR_HEIGHT}
```

- **`bottomInsetPx`**: `sheetVisibleHeight`는 `DraggableSheet`의 `onVisibleHeightSettle` 콜백(`:1793`)이 스냅 정착 시 커밋하는 **실측 DOM 값**이다. `DraggableSheet.tsx:131-142` `offsetOf()` — collapsed 상태에서는 `peek`(= `headerRef.current.offsetHeight`, 헤더 행 실측 높이)와 같고, mid/full 스냅에서는 그만큼 커진다. 즉 "지금 이 순간 바텀시트가 지도를 가리는 실제 픽셀 높이"가 정확히 들어 있다.
- **`topInsetPx`**: 실측이 아니라 `NeighborhoodMap.tsx:48-51`의 **하드코딩 상수**(`SEARCH_BAR_HEIGHT=54`, `CATEGORY_CHIPS_HEIGHT=42`) 합산값. biz 탭이면 96px, 그 외 54px.
- 두 값 다 `SaigonMapV5`로 넘어가지만, **`SaigonMapV5.tsx` 내부에서 bbox 산출(`onViewportChange`)에는 전혀 관여하지 않는다.** 실제 소비처:
  - `bottomInsetPx`만 → `getBottomInsetUnits()`(`:386-390`) → `clampVB()`(`:392-408`, 팬/줌 경계 클램프)와 `centerOnUnified`/`focusLatLng`/`fitToPoints`의 센터링 오프셋(포커스 시 바텀시트에 가리지 않게 중심을 위로 살짝 밀어줌).
  - `topInsetPx`는 `clampVB`엔 아예 안 들어간다(상단 클램프는 `slackYTop` 고정값만 사용). 실사용처는 딱 둘: 라벨 디클러터의 중심 편향 보정(`:956` `centerY = (topInsetPx + (ch - bottomInsetPx)) / 2`)과, 위치 버튼/줌힌트 필 위치 CSS(`:1375` `top: calc(... + topInsetPx)`).

**결론**: "가시 지도 사각형 → bbox" 변환에 필요한 재료(실측 bottomInset, 상수 topInset)는 **이미 컴포넌트 경계를 넘어 전달돼 있다.** 빠진 것은 그 값을 bbox 산출식에 반영하는 한 단계뿐 — 인프라를 새로 만들 필요는 없다.

### 1.4 주의점 — bottomInsetPx는 "매 순간" 값이라 fetch 트리거와 얽힌다

`SaigonMapV5.tsx:735-741`:
```ts
useEffect(() => {
  // suppressBbox: 이 이펙트는 시트 높이·선택모드/선택동 변화에 따른 LOD/뱃지 재계산용이지
  // 사용자 뷰포트 의도가 아니다 — bbox까지 재-emit하면 handleRegionSelect가 방금
  // 비운 viewportBbox를 500ms 뒤 되살리는 문제가 있었음. bbox는 제스처/줌/fit 경로만 emit.
  onViewportChange(true);
}, [bottomInsetPx, onViewportChange, polyActive, selWard]);
```

바텀시트를 드래그(mid/full로 확장)해도 **의도적으로 bbox를 재-emit하지 않는다**(대표 결정, 회귀 방지 주석 명시). 즉 지금 아키텍처는 "시트 움직임 = 뷰포트 의도 아님"을 못박아 뒀다 — bbox(fetch 트리거)에 인셋을 직결하면 이 결정과 충돌한다. §4에서 A/B 옵션 판단의 핵심 갈림길이 여기다.

---

## §2. 업체(biz) vs POI 마커 크기 실측 비교

마커 반경 산출(`SaigonMapV5.tsx:1186`): `r = vb.w * 0.015 * (m.r ?? 1)` — 화면 px 크기는 줌과 무관하게 `m.r` 배수에 비례(뷰박스 유닛이 컨테이너에 맞게 균일 스케일되므로).

`m.r` 값: **biz = 1.35**(`NeighborhoodMap.tsx:680, 706, 727`), **POI = 1.5**(`:698`), listing/feed = 기본값 1(명시 안 함). → **POI가 이미 biz보다 `m.r` 자체가 11% 크다.**

실제 렌더 도형까지 반영하면 격차는 더 벌어진다:

| 항목 | biz(비선택, 원형) `:1210` | POI(스퀘어클+halo) `:1242-1250` |
|---|---|---|
| 도형 반경식 | `r*0.92` (원) | `half=r*1.05`, halo `half*1.26` |
| 전체 폭(px, `r=0.015·cw·m.r` 기준) | `2×0.92×1.35 = 2.484` 단위 | 안쪽 사각형 `2×1.05×1.5=3.15` 단위, **흰 halo 포함 `2×1.05×1.26×1.5=3.969` 단위** |
| biz 대비 배율 | 1.00× (기준) | 안쪽 도형 **1.27×**, halo 포함 **1.60×** |

즉 POI는 halo까지 포함하면 **화면 footprint가 biz 마커의 약 1.6배**다. 업체가 이 탭의 주 콘텐츠(actionable, biz 탭 전용 레이어)이고 POI는 상시 참조용 배경 레이어인데, 배경 쪽이 시각적으로 더 크다.

라벨(이름) 노출 우선순위도 역전돼 있다. `labelDeclutter.ts:64-69, 76-84` `rankOf()`:
```
RANK_SELECTED=1000 > RANK_BADGE=800 > RANK_POI_LANDMARK=600 > RANK_POI_CIVIC=500
  > RANK_POI_OTHER=450 > RANK_GENERAL=100(일반 biz/listing/feed, 뱃지 없을 때)
```
겹침이 생기면(디클러터) 배지(안 읽은 소식) 없는 업체 라벨은 랭크 100으로, **모든 POI 등급(450~600)보다 낮다.** 즉 상호명과 랜드마크명이 겹치면 상호명이 먼저 사라진다.

**§2 수치 요약**: POI 아이콘은 biz 아이콘보다 몸체 기준 27%, halo 포함 60% 더 크고, 라벨 디클러터 우선순위도 POI(450~600)가 biz(100, 뱃지 없을 시)보다 항상 높다 — "업체가 묻힌다"는 체감이 코드 수치로 확인됨.

---

## §3. 표준 레퍼런스

### 3.1 뷰포트 패딩(크롬 제외 가시영역)

- **Mapbox GL JS**: `padding` 옵션이 `jumpTo`/`easeTo`/`flyTo`/`fitBounds`/`fitScreenCoordinates`/`setPadding` 전반에 공통 존재. "떠있는 UI가 지도를 덮을 때 카메라의 중심(vanishing point)을 그만큼 보정"하는 표준 기능으로 문서화됨. ([Mapbox: Offset the vanishing point using padding](https://docs.mapbox.com/mapbox-gl-js/example/offset-vanishing-point-with-padding/), [Properties and options](https://docs.mapbox.com/mapbox-gl-js/api/properties/))
- **Google Maps SDK(Android/iOS)**: `GoogleMap.setPadding()` — "지도는 컨테이너 전체를 계속 채우지만, 텍스트/컨트롤 위치·제스처·카메라 이동은 더 작은 영역에 있는 것처럼 동작"한다고 명시. 하단에 커스텀 UI를 깔면 "로고/법적고지가 항상 보이도록 하단 패딩을 추가하라"는 것이 공식 권장 패턴. ([Configure a map | Maps SDK for Android](https://developers.google.com/maps/documentation/android-sdk/configure-map))
- 공통점: 두 SDK 다 "패딩 = 카메라/제스처/컨트롤 배치의 기준 영역을 줄이는 것"이지, 이번 사례처럼 "서버 질의 bbox"를 자르는 개념은 아니다 — 그건 이 앱이 지도 SDK 대신 자체 SVG+bbox-fetch 아키텍처를 쓰기 때문에 생기는 saigon_rider 고유의 다음 단계(§1.3 인셋을 bbox 산출까지 확장)이며, 표준 SDK에서 직접적인 선례는 없다(추정 — 표준 SDK는 서버 질의를 앱이 별도로 관리하는 구조가 아니라 SDK가 타일을 관리하므로 "질의 범위"라는 개념 자체가 다르다).

### 3.2 업체(POI 비즈니스) vs 랜드마크 마커 표현

Google Maps Cloud-based styling 문서(landmarks): 랜드마크는 두 아이콘 스타일 중 선택 가능 — **Standard**(다른 place marker와 유사한 외양, 티얼색 teardrop+흰 아이콘)와 **Illustrated**(랜드마크별 흑백 라인아트, **"표준 POI 마커의 2~3배 크기"**). ([Change the style of landmarks | Maps JS API](https://developers.google.com/maps/documentation/javascript/cloud-customization/landmarks))

이 레퍼런스에서 핵심은 방향이 saigon_rider와 **반대**라는 점이다: Google은 랜드마크를 "지도 위 배경 요소를 이해하는 참조 레이어"로 취급하고, 그걸 강조하고 싶을 때만(테마 커스터마이징) 표준보다 크게 만든다 — 하지만 그건 랜드마크가 **주가 되는 지도(관광/탐색용)**의 선택 스타일이다. saigon_rider의 biz 탭은 **업체가 검색 결과(actionable content)**이고 POI(landmark/civic)는 **상시 배경 참조 레이어**다. 표준 지도 UX에서 "검색 결과 마커(빨간 핀+아이콘)"는 배경 POI보다 항상 크고 채도 높게 그려 리스트-지도 정합을 강조하는 것이 일반적 관행이다(추정 — 별도 1차 출처 미확보. Google Maps "검색 시 배경 POI가 흐려지고 결과 핀만 도드라지는" 동작은 UI 상 통상 관찰되는 패턴이나, 이번 조사에서 이를 규정한 1차 문서를 찾지 못함).

---

## §4. 조치안 ① — 검색범위(query bbox) 인셋

### 배경 요약
필요한 재료(실측 `sheetVisibleHeight`/`postPanelHeight`, 상수 `SEARCH_BAR_HEIGHT+CATEGORY_CHIPS_HEIGHT`)는 이미 `NeighborhoodMap.tsx:1601-1602`에서 `SaigonMapV5`로 넘어가 있다. 다만 현재 아키텍처는 "시트 움직임은 bbox(fetch)를 재emit하지 않는다"는 명시적 결정(`SaigonMapV5.tsx:735-741` 주석)을 갖고 있어, 인셋을 fetch bbox에 직결하면 이 결정과 충돌한다.

### 옵션 A — fetch/query bbox 자체를 크롭 (SaigonMapV5.onViewportChange 수정)
- **구현 스케치**: `getBottomInsetUnits`처럼 `getTopInsetUnits(viewHeight)`를 추가하고, `onBboxChange` 호출 시 `vb.y + topInsetUnits` / `vb.y + vb.h - bottomInsetUnits`로 N/S를 좁혀서 emit.
- **영향 범위**: `NeighborhoodMap.tsx`의 fetch 이펙트(`:531-597`)가 그대로 이 좁아진 bbox를 받음 — 코드 변경은 `SaigonMapV5.tsx` 한 곳(+ 필요 시 emit 트리거 조건 재검토)으로 국소적.
- **회귀 위험**: (1) `bottomInsetPx` 변경 시 bbox를 emit하지 않는 현재 결정(§1.4)을 유지하면, 시트만 움직였을 때 카운트/리스트가 "방금 좁아진 실제 가시영역"을 반영 못 하고 다음 지도 제스처까지 stale 유지 — 버그를 부분적으로만 고침. 이를 고치려면 시트 스냅 변경도 bbox를 재emit하게 바꿔야 하는데, 그러면 시트를 드래그할 때마다 네트워크 재조회가 발생 — 기존에 의도적으로 막아둔 동작(주석 명시)을 되살리는 셈이라 별도 검토·QA 필요. (2) region 모드(`regionBbox`) 등 다른 bbox 소비처에도 일관 적용해야 하는지 재검토 필요(region 모드는 현재 비활성 상태 — 2026-07-12 결정 — 이므로 당장은 영향 적음). (3) 줌 게이트(`showDistrictBadges`) 판정에는 영향 없음(vb.w 기준, bbox 크롭과 무관).
- **공수**: 중(SaigonMapV5 변경 + 시트 연동 정책 재결정 필요).

### 옵션 B — fetch bbox는 유지, "가시-안전 bbox"를 클라이언트에서 파생해 카운트/리스트/마커 렌더만 추가로 자름 (권장)
- **구현 스케치**: `NeighborhoodMap.tsx`에서 `bboxFilter`(전체 뷰포트, 그대로 fetch에 사용) 외에, `visibleSafeBbox = bboxFilter를 topInsetPx/bottomInsetPx만큼 latitude 축으로 크롭한 값`을 `useMemo`로 파생. 크롭 비율(px→lat) 계산에 필요한 "지도 컨테이너 픽셀 높이"는 SaigonMapV5가 이미 내부적으로 알고 있으므로, `emitBboxRef` 패턴과 동일하게 **새 imperative 메서드(예: `getVisibleSafeBbox(): LatLngBbox`)를 SaigonMapV5에 얕게 추가**해 부모가 필요할 때(뷰포트 커밋 시 + `sheetVisibleHeight`/`topInsetPx` 변경 시) 호출. `visibleBiz`/`visibleListings`/`visiblePosts`(그리고 `markers` useMemo)의 필터 조건에 `bboxFilter` 대신(또는 추가로) 이 값을 사용.
- **영향 범위**: 네트워크 fetch 코드·줌 게이트·디바운스 로직은 전혀 안 건드림 — `visibleBiz` 등 클라이언트 파생 useMemo 및 SaigonMapV5에 얕은 헬퍼 1개 추가.
- **회귀 위험**: 낮음. 기존 "시트 움직임 = fetch 트리거 아님" 결정을 그대로 존중하면서, 카운트/리스트/핀 렌더만 시트 드래그에 실시간 반응(추가 네트워크 호출 없음 — 이미 fetch된 superset 안에서 재필터일 뿐). 단 하나 확인 필요: 크롭이 너무 타이트해지면(예: 시트를 'full'까지 올렸을 때, 상단 슬리버만 남는 극단 케이스) 리스트가 갑자기 0건에 가깝게 줄어드는 체감이 있을 수 있음 — 이건 오히려 "리스트가 곧 지도에 보이는 것"이라는 의도된 동작이나, UX 확인 필요(바텀시트를 올리는 중엔 사용자가 리스트를 보고 있으므로 지도 위 실제 가시 영역과 무관하게 리스트는 전체를 보여줘야 한다는 반론도 가능 — §6 결정 필요 항목).
- **공수**: 중(SaigonMapV5에 헬퍼 추가 + NeighborhoodMap 파생 로직 + 마커 렌더 필터 반영).

### 추천
**옵션 B.** 사용자가 보고한 증상("N건이라는데 안 보임")의 근본 원인은 "카운트 소스가 화면에 실제로 보이는 영역과 다르다"는 것이지 "네트워크가 너무 넓게 조회한다"가 아니다 — fetch bbox는 오히려 넉넉한 편이 팬 시 깜빡임을 줄여준다는 기존 설계 의도(`MAX_MAP_LISTINGS` 주석 등)와도 맞는다. 옵션 B는 그 원인만 정확히 겨냥하면서 fetch/디바운스/줌게이트라는, 이미 여러 차례 회귀를 겪은 것으로 보이는(주석에 회귀 사례가 명시적으로 여러 번 언급됨) 민감한 로직을 전혀 건드리지 않는다. 옵션 A는 사용자의 표현("query bbox")에 더 문자적으로 부합하지만, 시트-fetch 연동 정책을 다시 여는 대가가 더 크다.

**시작값(실기 조정)**: 상단 크롭은 기존 `topInsetPx` 그대로(54px / 96px), 하단 크롭은 기존 `bottomInsetPx`(sheetVisibleHeight 실측) 그대로 재사용 — 새로운 튜닝 상수 불필요, 이미 실측/상수화된 값을 재사용하는 것이 이 조치안의 핵심.

---

## §5. 조치안 ② — 업체/POI 마커 시각 위계

### 옵션 A — biz 마커를 키운다
- **구현 스케치**: `NeighborhoodMap.tsx`의 biz marker 생성 3곳(`:680, 706, 727`) `r: 1.35` → `r: 1.6`(POI의 1.5를 살짝 넘김) 안팎으로 상향. 라벨 디클러터에 `RANK_BIZ`(예: 700 — `RANK_BADGE(800)`과 `RANK_POI_LANDMARK(600)` 사이) 신설, `labelDeclutter.ts:76-84 rankOf()`에서 `m.kind === 'biz'`일 때 `RANK_GENERAL` 대신 이 값을 반환.
- **영향 범위**: `NeighborhoodMap.tsx` marker 매핑 3곳(치환), `labelDeclutter.ts` rankOf 분기 1곳 추가. `SaigonMapV5.tsx` 렌더 로직(도형 자체)은 무수정 — `r`이 이미 파라미터화돼 있어 값만 바뀜.
- **회귀 위험**: 낮음. biz 마커가 커지면 밀집 지역에서 서로 더 많이 겹칠 수 있어 디클러터 결과가 달라짐(허용 범위 내 추정) — 실기 확인 필요. 라벨 랭크 상향은 "이제 업체명이 랜드마크명보다 항상 우선 노출"로 방향이 바뀌는 것이므로, 관광/랜드마크 지향 화면(향후 확장 시)에서 의도와 맞는지 확인 필요.
- **공수**: 소(상수/분기 값 변경 수준).

### 옵션 B — POI 마커를 줄이고 존재감을 낮춘다
- **구현 스케치**: POI marker `r: 1.5`(`NeighborhoodMap.tsx:698`) → `1.0` 안팎으로 하향, `SaigonMapV5.tsx:1247` 흰 halo(`rgba(255,255,255,0.65)`) 투명도를 더 낮추거나 제거해 "배경 참조" 느낌 강화. 라벨 랭크는 유지(POI 이름은 여전히 보여야 하지만 아이콘 자체 크기만 축소).
- **영향 범위**: `NeighborhoodMap.tsx` POI marker 1곳, `SaigonMapV5.tsx` POI 렌더 블록(`:1242-1267`) 스타일 값.
- **회귀 위험**: 낮음. 다만 POI(랜드마크/관공서)가 "동네 오리엔테이션" 목적으로 상시 노출되는 레이어이므로, 너무 축소하면 그 자체 목적(길찾기 랜드마크 역할)이 약해질 수 있음 — 밸런스 확인 필요.
- **공수**: 소.

### 추천
**A+B 병행(하이브리드), 단 최소치만.** biz `r 1.35→1.6`으로 올리고, POI halo만 살짝 옅게(`0.65→0.45` 투명도) 하되 POI `r` 자체는 유지 — "업체가 화면에서 명백히 더 눈에 띄는 콘텐츠"가 되면서도 POI가 "참조선"으로서 여전히 식별 가능하게 남는 절충. 라벨 랭크(옵션 A의 `RANK_BIZ` 신설)는 §2에서 확인된 "상호명이 랜드마크명에 밀려 사라지는" 문제의 직접 원인이므로 크기 조정과 별개로 반드시 같이 손봐야 실효가 있음 — 크기만 키우고 랭크를 안 바꾸면 라벨은 여전히 랜드마크에 밀림.

**시작값(실기 조정)**: biz `r: 1.35 → 1.6`, `RANK_BIZ = 700`, POI halo opacity `0.65 → 0.45`(POI `r`은 1.5 유지).

---

## §6. 미결정 / 사용자 결정 필요

1. **①의 A vs B**: query bbox 자체를 자를지(A, fetch 트리거 정책 재검토 수반), 클라이언트 파생 크롭만 추가할지(B, 권장). B를 택하면 "시트를 올리는 동안 실제로는 카운트/리스트가 줄어드는" 체감을 원하는지(가시영역과 100% 정합) vs "시트가 열려 있을 땐 리스트는 전체를 유지하고 지도 위 핀만 크롭할지"(리스트와 핀 소스를 분리하는 추가 분기)도 함께 정해야 함.
2. **②의 랭크 방향**: biz 라벨이 POI(랜드마크 포함) 라벨보다 **항상** 우선해야 하는지, 아니면 랜드마크(POI_LANDMARK)까지는 여전히 우선하고 civic/other POI만 밀어내는 절충 랭크로 할지 — `RANK_BIZ` 값의 정확한 위치(위 제안은 800과 600 사이, 즉 landmark보다도 위) 확정 필요.
3. **②의 수치 튜닝**: `r: 1.6`, `RANK_BIZ: 700`, halo opacity `0.45`는 모두 시작값 제안(추정)이며 실기 확인 후 조정 필요 — 이 문서만으로 확정값 아님.
4. **region 모드 재활성 여부**: 현재 region 선택 기능은 비활성(2026-07-12 결정, `regionBbox`/`onRegionSelect` 로직은 주석 보존)이라 ①의 크롭 적용 대상에서 사실상 제외했음 — 향후 재활성 시 동일 크롭을 region bbox에도 적용할지 별도 확인 필요.
