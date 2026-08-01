# 동네지도 POI 마커/라벨 충돌회피·디클러터링 — 조사 (의사결정용)

> 작성일: 2026-07-20
> 상태: **조사 완료 — 사용자 결정 대기 (코드 미수정)**
> 범위: 코드 수정 없음. `SaigonMapV5.tsx`/`NeighborhoodMap.tsx`/`v2/region.ts`/`poiCategoryIcons.ts` 직접 Read + 웹 조사(WebSearch/WebFetch, 1차 공식 문서 우선) 기반.

---

## 0. 문제 요약

동네지도에서 인접한 POI/업체/매물/피드 핀·라벨이 겹쳐 읽기 어렵다(예: "Dan Sinh market" ↔ "Chùa Phụng Sơn" 라벨 중첩). 현재는 소프트웨어적 판별·처리 로직이 전혀 없다(§1에서 확정). 사용자 아이디어: "인접 시 화면 중앙의 아이콘/라벨을 강조하고, 인접 항목은 defocus(라벨 숨김)". 이 문서는 (1) 현행 기술 확정, (2) 표준 관행 조사, (3) 알고리즘 옵션, (4) 사용자 아이디어 평가, (5) 구체 접근안 A/B/C + 추천을 담는다.

---

## 1. 현행 렌더링 기술 — 확정 결론

**결론: 외부 지도 SDK 없음. 순수 커스텀 SVG(DOM) 렌더 — 내장 충돌엔진을 가져다 쓸 수 없고, 직접 구현해야 한다.**

근거 (직접 Read, `frontend/src/components/maps/SaigonMapV5.tsx` 전체 1206줄 + `pages/map/NeighborhoodMap.tsx`, `components/maps/v2/region.ts`):

- **좌표계**: `SaigonMapV5.tsx:26-42` — equirectangular 근사 투영을 손수 구현한 "통합 좌표계"(`BASE_W=10000` 유닛). `lx()/ly()` 로 lat/lng → 유닛 좌표 선형 변환. Mapbox/MapLibre/Leaflet/Google/Apple 등 어떤 지도 SDK도 로드하지 않는다(package.json/코드 어디에도 `mapbox-gl`/`maplibre-gl`/`leaflet`/`@react-google-maps` import 없음 — grep 결과 0건).
- **렌더 대상**: 단일 최상위 `<svg>` (`svgRef`, `preserveAspectRatio="none"`) 안에 depth1(동 경계, 항상)·depth2(블록, LOD 게이트)·depth3(건물/도로, LOD 게이트)가 **nested `<svg x y width height viewBox>`** 로 지리 bbox 위치에 배치된다(`SaigonMapV5.tsx:840-912`). Canvas/WebGL 요소 전혀 없음 — 전량 SVG 벡터 DOM.
- **팬/줌**: `vbRef`(ref, 애니메이션 fast-path) + `setVBAttr()`(`SaigonMapV5.tsx:311-316`)가 `<svg>`의 `viewBox` 속성을 **직접 DOM 조작**으로 갱신 — React state 를 거치지 않는다. 이 덕분에 팬 중 마커 위치는 React 리렌더 없이도 브라우저의 네이티브 SVG viewBox 재투영만으로 화면상 정확히 따라간다(마커 좌표 자체는 `lx(m.lng)/ly(m.lat)` 절대값, viewBox 와 무관). React 상태(`vbSnap`)는 LOD 전환·컬링 대상 마커 등/퇴장이 필요할 때만 리렌더를 트리거한다(포인터업/디바운스/줌 완료 시점 — 매 프레임 아님).
- **LOD 게이팅**: `L1_VBW`(60%)/`L2_VBW`(35%)/`L3_VBW`(7%)/`MIN_VBW`(1%) — viewBox 너비(줌 근사치) 임계값으로 "도시 뱃지 → 동 뱃지 → 개별 마커" 전환(`SaigonMapV5.tsx:44-48, 460-486, 978-998`). **이건 줌 레벨 기준 디테일 축소일 뿐, 마커 간 인접성(공간 충돌)은 전혀 판별하지 않는다.**
- **마커/라벨 렌더**(`SaigonMapV5.tsx:998-1141`): `markers` prop(`MapMarkerV2[]`)을 그대로 `.map()`하여 각 항목을 `<g><circle|path>...<text>{m.label}</text></g>`로 그린다. 뷰포트 컬링(`mx/my` 가 `vb ± 50` 유닛 밖이면 `return null`)만 있고, **마커-마커, 라벨-라벨, 라벨-아이콘 간 겹침 판정/우선순위/숨김 로직은 코드 전체에 단 한 줄도 없다** — `m.label` 이 존재하면 무조건 그린다(POI는 "이름 라벨 상시 노출" 이라고 주석에 명시, `poiCategoryIcons.ts`/`SaigonMapV5.tsx:1071-1081`). 그리기 순서도 배열 순서 그대로(z-index/우선순위 정렬 없음) — 나중 항목이 시각적으로 위에 겹친다.
- **클러스터링/스파이더파이**: 없음. 줌아웃 시 뜨는 "구역 카운트 뱃지"(`districtBadges`/`cityBadges`, `SaigonMapV5.tsx:978-997`)는 서버가 미리 집계한 숫자를 원에 찍는 것으로, 개별 마커를 공간적으로 묶는 클러스터링이 아니다.
- **참고(기존 유사 패턴, §4에서 재인용)**: `NeighborhoodMap.tsx:890-924` "자동 말풍선" — bbox 중심(`cLat/cLng`)에서 정규화 거리 최근접 **업체 1곳**을 자동 선택해 말풍선을 띄우는 로직이 이미 존재한다. 단, 이건 "레이어 하나에서 대표 1개 선택"용이지 **다수 마커/라벨 간 겹침을 해소하는 디클러터 로직이 아니다** — 선택되지 않은 인접 마커의 라벨은 여전히 그대로 상시 노출된다.

**함의**: Mapbox GL `symbol-sort-key`/OpenLayers `declutter` 같은 "옵션 하나 켜면 되는" 내장 기능은 이 스택엔 없다. 충돌 판정·우선순위·숨김을 전부 애플리케이션 코드(React/SVG 렌더 루프)에서 만들어야 한다. 다만 이미 마커별 절대 화면 근사 좌표(`mx,my`)와 vb 기준 스케일된 크기(`r`)가 렌더 시점에 계산되어 있어, 충돌 판정에 필요한 입력 자체는 이미 손에 쥐고 있다 — "이식 가능성"은 높다(추정: 기존 렌더 루프에 추가 계산을 끼워 넣는 정도의 공수, §5 참조).

---

## 2. 표준 지도서비스의 처리 기법 조사

1차 공식 문서 기준. WebSearch/WebFetch로 확인.

| 기법 | 무엇인가 | 언제 쓰나 | 장점 | 단점 | 우리 스택 이식 가능성 |
|---|---|---|---|---|---|
| **Mapbox GL JS `icon-allow-overlap`/`text-allow-overlap`** (기본 `false`) | symbol 레이어 렌더 시 겹치는 아이콘/텍스트를 자동으로 숨기는 충돌 판정 엔진 | 벡터타일 심볼 레이어 전반 | 옵션 하나로 전체 자동 적용, 성능 최적화됨(엔진 내장) | 레이어/심볼 단위 이진 스위치 — 세밀한 커스텀 규칙은 어려움 | **낮음(직접 없음)** — 개념(우선순위 정렬 후 겹치면 숨김)만 차용 가능, 엔진 자체는 못 씀(SVG 자체 렌더라 벡터타일 심볼 개념이 없음) |
| **`symbol-sort-key` / `symbol-z-order`** | 런타임에 어떤 심볼이 먼저 배치권(우선순위)을 갖는지 지정하는 정렬 키. sort-key 낮을수록 먼저 배치·우선권 | 데이터에 우선순위를 못 매겼거나 런타임에 동적으로 바꿔야 할 때 | 데이터 재생성 없이 우선순위 제어 | overlap=true/false 조합에 따라 정렬 방향이 반대로 동작하는 등 함정 있음(GitHub 이슈 다수) | **높음(개념)** — "마커 배열에 priority 필드를 매겨 정렬 후 그리기/판정" 은 그대로 이식 가능 |
| **`icon-ignore-placement`/`text-ignore-placement`** | 자신은 그리되, 다른 심볼이 자신과 겹쳐도 그 심볼의 배치를 막지 않음(단방향 무시) | 배경성 아이콘(도로명 등)이 다른 라벨 배치를 방해하면 안 될 때 | 세밀한 레이어 간 상호작용 제어 | 이해·디버깅 난이도 있음 | **중간** — "이 레이어는 판정에서 제외" 플래그로 이식 가능 |
| **Google Maps `AdvancedMarkerElement.collisionBehavior`**: `REQUIRED`(항상 표시)/`OPTIONAL_AND_HIDES_LOWER_PRIORITY`(충돌 시 낮은 `zIndex` 숨김, 동률이면 화면 아래쪽이 우선)/`REQUIRED_AND_HIDES_OPTIONAL` | 마커별로 "무조건 표시" vs "겹치면 우선순위 낮은 쪽 숨김" 을 선언적으로 지정 | 벡터 지도(vector map) 전용, POI 라벨과 커스텀 마커 공존 시 | 마커 단위 선언적 설정, zIndex 로 우선순위 명시적 제어 | 벡터 맵 전용(래스터 맵 미지원) | **높음(개념)** — 정확히 우리에게 필요한 3분류(항상 표시/충돌 시 숨김/충돌 유발 안 함) 그대로 차용 가능 |
| **Apple MapKit `displayPriority`(`.required`/`.defaultHigh`/`.defaultLow`) + `collisionMode`(`.circle`/`.rectangle`) + annotation clustering** | 우선순위 등급 + 충돌 판정 도형(원/사각) 지정, 부족하면 자동 클러스터링(iOS 11+) | 다수 POI/사용자생성 어노테이션이 밀집하는 지도 앱 전반 | 클러스터링까지 결합해 줌아웃에서도 성능·가독성 확보 | iOS 네이티브 SDK 전용 개념(우리는 웹뷰) | **높음(개념)** — "충돌 판정 도형을 원으로 근사 + 3단계 우선순위" 는 SVG 렌더 루프에 그대로 이식 가능 |
| **Leaflet `Leaflet.markercluster` + spiderfy** | 동일/근접 좌표 마커를 줌아웃 시 숫자 클러스터로 뭉치고, 최대 줌에서도 겹치면 탭 시 부챗살(spider) 모양으로 펼쳐 전부 노출 | 완전/거의 동일 좌표에 다수 포인트가 몰리는 경우(같은 건물 여러 업체 등) | 정보 손실 없이(숨기지 않고) 전부 접근 가능, 탭 인터랙션으로 명시적 해제 | 클러스터 배지가 늘어나면 그 자체가 또 하나의 UI, 소규모 겹침엔 과함 | **중간** — 완전 좌표 중복(건물 내 여러 업체) 케이스엔 스파이더파이가 유효한 보완책. 일반 라벨 겹침엔 과설계 |
| **OpenLayers `declutter: true` / `"separate"`** | 레이어의 이미지+텍스트 스타일 전체에 대해 화면공간 겹침을 자동 판정해 우선순위(레이어 z-index → 스타일 zIndex → 렌더 순서) 낮은 것을 숨김. `declutter group` 로 레이어 그룹별 독립 판정도 가능 | 벡터/벡터타일 레이어의 라벨·심볼이 밀집할 때 | 레이어 전체에 일괄 적용, 그룹 단위 제어 유연 | OpenLayers 캔버스/WebGL 렌더러 내부 로직 — 이식 불가 | **낮음(직접 없음)** — "우선순위(z-index 계층) → 렌더 순서" 정렬 규칙 개념만 차용 |
| **공통 알고리즘: greedy 우선순위 배치** | 마커/라벨을 우선순위 내림차순 정렬 → 화면공간 박스를 하나씩 배치하며 이미 배치된 박스와 겹치면 스킵(숨김) | 위 5개 SDK 전부의 공통 내부 원리 | 구현 단순(O(n log n) 정렬 + O(n) or O(n²) 겹침 검사), 예측 가능한 결과 | 우선순위 함수 설계가 품질을 좌우, 프레임마다 전량 재계산 시 비용 | **높음** — §5 접근안의 핵심 알고리즘 |
| **줌별 LOD(줌아웃 시 숨김/클러스터)** | 줌 레벨에 따라 표시할 최소 중요도 임계값을 높임 | 저줌에서 정보 과밀 방지 | 이미 우리 코드에 `L1/L2/L3_VBW` 로 부분 구현됨 | 줌 레벨만으론 "인접 2개 마커가 동일 줌에서 겹치는" 케이스를 못 잡음(우리 문제의 핵심 케이스) | **이미 있음(보완 필요)** |
| **라벨 오프셋/leader line** | 겹치면 라벨을 마커에서 살짝 띄우고 가는 선(leader line)으로 연결 | 라벨이 많고 마커 자체는 유지하고 싶을 때 | 라벨을 숨기지 않고 정보 보존 | 오프셋 위치 계산이 복잡(다른 라벨/마커와 재충돌 가능), leader line 이 지저분해질 수 있음 | **중간~낮음** — 구현 복잡도 대비 우리 문제(POI 이름 vs 업체 핀) 규모엔 과함 |
| **viewport-center 우선(사용자 아이디어 관련)** | 화면 중앙에 가까운 항목을 우선 표시/강조 | "지금 보고 있는 것"을 부각하는 보조 기법(Naver/Kakao 지도 등 일부 앱의 "중앙 마커 강조") | 사용자의 현재 주목 지점과 UI 강조가 일치, 이미 우리 코드에 유사 패턴(자동 말풍선) 존재 | **주 우선순위로 쓰면 팬 할 때마다 "무엇이 중앙인가"가 바뀌어 라벨이 계속 깜빡깜빡 나타났다 사라짐** — 표준 SDK들은 이걸 메인 판정 기준으로 쓰지 않고, 데이터 고유 중요도(rank/importance)를 메인으로, 화면중앙 강조는 "선택 항목 하이라이트"라는 별도 보조 기능으로 분리 | **있음(개념) — 단, 메인 알고리즘이 아니라 보조 레이어로** |

출처:
- [Optimize map label placement — Mapbox](https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/)
- [Enable symbol-sort-key issue — mapbox-gl-js #9368](https://github.com/mapbox/mapbox-gl-js/issues/9368)
- [MapLibre Style Spec — Layers](https://maplibre.org/maplibre-style-spec/layers/)
- [Symbol Placement and Collision Detection — MapLibre Native (DeepWiki)](https://deepwiki.com/maplibre/maplibre-native/3.3-symbol-placement-and-collision-detection)
- [Control collision behavior, altitude, and visibility — Google Maps JS API](https://developers.google.com/maps/documentation/javascript/advanced-markers/collision-behavior)
- [Marker Collision Management example — Google Maps JS API](https://developers.google.com/maps/documentation/javascript/examples/marker-collision-management)
- [Managing markers, labels, and POI collisions — Android SDK](https://developers.google.com/maps/documentation/android-sdk/manage-marker-label-collisions)
- [displayPriority — Apple Developer Documentation](https://developer.apple.com/documentation/mapkit/mkannotationview/displaypriority)
- [Decluttering a Map with MapKit Annotation Clustering — Apple](https://developer.apple.com/documentation/MapKit/decluttering-a-map-with-mapkit-annotation-clustering)
- [Leaflet.markercluster — GitHub](https://github.com/Leaflet/Leaflet.markercluster)
- [Spiderfy on any zoom level — Leaflet.markercluster #502](https://github.com/Leaflet/Leaflet.markercluster/issues/502)
- [Vector Label Decluttering — OpenLayers examples](https://openlayers.org/en/latest/examples/vector-label-decluttering.html)
- [Declutter Group — OpenLayers examples](https://openlayers.org/en/latest/examples/declutter-group.html)

**사용자 아이디어 매핑**: "중앙 강조 + 인접 defocus" 는 (a) **priority-based collision detection**(위 공통 알고리즘) 의 일종이되, (b) 우선순위 함수로 "화면 중앙과의 거리"를 쓴다는 점에서 표준 SDK들의 기본 방식(데이터 고유 중요도/rank/zIndex)과는 다르다. 표준 관행에서 "중앙 근접"은 어디까지나 **부가 강조(하나만 선택해 하이라이트)**로 쓰이지, 전체 마커 집합의 라벨 표시/숨김을 결정하는 **1차 판정 기준**으로 쓰이는 사례는 조사된 5개 SDK 어디에도 없다.

---

## 3. 인접(overlap) 판별 알고리즘 옵션

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A. 픽셀 거리 임계값** | 마커 중심 간 화면 픽셀 거리 `d < threshold(zoom)` 이면 "충돌"로 간주(우리 자동말풍선의 `Math.hypot` 정규화 거리 계산과 동일 패턴) | 계산 极단순, 기존 코드 패턴과 일관 | 라벨 텍스트 길이를 무시 — 짧은 라벨끼리는 안 겹쳤는데 오탐, 긴 업체명끼리는 멀어도 실제로 겹치는데 미탐 |
| **B. 스크린공간 AABB(라벨 바운딩박스) 겹침** | 라벨 텍스트 폭을 추정(글자수 × 평균폭 × fontSize, 또는 1회 `canvas.measureText` 캐시) 해 사각형 두 개의 axis-aligned overlap 테스트 | 라벨 실제 크기를 반영 — 정확도 높음, 표준 SDK들의 방식과 동일 원리 | 텍스트 폭 추정치가 정확하지 않으면(다국어 폰트 폭 차이 — 베트남어 diacritics 포함) 오차 발생. `getBBox()` 로 실측 시 매 마커 DOM 측정 비용 발생(수백 개면 프레임당 부담) |
| **C. 공간 인덱스(grid bucket)로 O(n) 근사** | 화면을 라벨 높이 2배 크기 셀로 나눠 마커를 셀에 배정, 같은/인접 셀끼리만 겹침 검사 | 마커 수가 많아져도(수천) 선형에 가까운 성능 | 현재 화면당 마커 상한이 ~200~300(기존 주석 "핀 최대 200개", `MAX_MAP_LISTINGS=300`)이라 O(n²) 전수 비교(최대 약 4~9만 회 비교)도 이미 충분히 저렴 — 지금 규모엔 **과설계 가능성** |
| **우선순위 정렬 기준(공통 요소)** | 거리(중앙/선택 핀)·카테고리(POI landmark > civic > 일반 dot)·상태(선택됨/뱃지 있음 최우선)·줌레벨(딥줌일수록 더 많이 노출) 조합 | 표준 SDK 방식과 정합, 유연 | 여러 기준을 섞을수록 "왜 이 라벨이 숨었는지" 설명하기 어려워짐 — 기준 3개 이하 권장 |
| **팬/줌 중 깜빡임(flicker) 방지** | (1) 히스테리시스: 한번 숨긴 라벨은 임계값보다 살짝 여유를 더 줘야 다시 보이게(on/off 임계값을 다르게), (2) 디바운스: 제스처가 끝난 시점(`vbSnap` 갱신 시점 — 이미 존재하는 패턴)에만 재계산, 매 프레임 계산 안 함 | 기존 코드가 이미 "제스처 종료 시에만 vbSnap 갱신" 패턴을 씀(§1) — 그대로 재사용 가능 | 히스테리시스 없이 순수 임계값 하나만 쓰면 경계선 근처에서 라벨이 반복적으로 나타났다 사라짐 |
| **성능** | 마커 수(현재 최대 ~200~300)가 재계산 시점(제스처 종료)에만 O(n log n) 정렬 + O(n²) 또는 O(n) 겹침 검사 1회 수행 | 매 프레임이 아니라 제스처 종료 시 1회이므로 현재 규모에서 성능 리스크 낮음(추정) | 향후 마커 상한을 크게 올리면(예: 1000+) O(n²) 은 위험해짐 — 그때 grid 도입 |

---

## 4. 사용자 아이디어 평가 + 대안

### 4.1 타당한 점
- "인접 시 무언가 하나는 남기고 나머지는 defocus" 방향 자체는 §2 조사한 5개 표준 SDK의 공통 원리(priority-based collision hiding)와 **동일한 카테고리**다. 접근 자체가 틀리지 않았다.
- "화면 중앙" 을 신호로 쓰는 것도 근거가 없지 않다 — 이미 이 저장소에 **거의 동일한 선례**가 있다(`NeighborhoodMap.tsx:890-924` 자동 말풍선: bbox 중심 최근접 1개 선택). 사용자가 이미 익숙한 이 앱의 기존 UX 언어와 일관된 제안이다.

### 4.2 함정 (표준 관행 대비)
1. **"무엇을 중앙으로?"가 모호하다.** 지도 뷰포트(`viewBox`) 기하학적 중심을 그대로 쓰면, 하단 드래거블 시트가 화면의 상당 부분(최대 72vh, `bottomInsetPx`/`getBottomInsetUnits` 로 이미 별도 보정 중인 값)을 가리는 현재 UI에서 "화면상 실제로 보이는 중앙"과 어긋난다. 기존 자동 말풍선도 이 보정을 안 하고 `bboxFilter` 기하 중심을 그대로 쓰고 있어(코드 확인됨) — 이미 존재하는 잠재 이슈이며, 새 디클러터 로직에 그대로 이식하면 같은 부정확성을 물려받는다.
2. **선택 핀 우선 vs 중앙 우선이 충돌할 수 있다.** 사용자가 특정 핀을 탭해 `selected`(포스트 패널 포커스)로 만든 상태에서, 그 핀이 화면 중앙이 아니면 "중앙 강조"가 사용자가 방금 선택한 항목이 아닌 다른 항목을 강조하게 된다 — 표준 SDK가 "우선순위(zIndex/rank)"를 데이터 속성으로 우선하고 중앙 여부를 부가 신호로만 쓰는 이유가 바로 이것이다.
3. **팬 중 깜빡임.** 순수 "화면 중앙과의 거리"를 1차 판정 기준으로 쓰면, 사용자가 지도를 조금만 움직여도 "어느 게 중앙에 가장 가까운가"가 계속 바뀌어 defocus 대상이 자주 뒤바뀐다 — §3의 히스테리시스로 완화는 가능하나 근본적으로 "중앙 거리"는 변동성이 큰 신호다.
4. **라벨만 숨길지 아이콘도 숨길지 미정.** 대부분 표준 SDK(Mapbox `text-optional`, Google `collisionBehavior`)는 **아이콘은 유지하고 라벨(텍스트)만 우선 숨기는** 옵션을 기본으로 둔다 — 아이콘까지 없애면 "거기에 뭔가 있다"는 정보 자체가 사라지기 때문. 사용자 표현 "인접 항목은 defocus(라벨 숨김)" 은 이미 이 방향과 일치한다(라벨만 숨김) — 이 부분은 그대로 채택 가능.
5. **겹침 해소 후 다시 보일 조건이 없다.** 사용자가 딥줌하면 자연히 라벨 간 화면 거리가 벌어지므로 판정 함수가 줌 폭(vb.w)을 반영하기만 하면 자동으로 재노출된다 — 별도 "복귀" 로직을 새로 만들 필요는 없고, 임계값을 줌 종속으로 설계하면 해결됨.

### 4.3 개선안 (권장 조합)
- **1차 우선순위 = 마커 자체 속성 랭크**(선택됨 > 안읽은소식 뱃지 > POI landmark > POI civic > 일반 업체/매물/피드), **2차 타이브레이커로만 "중앙과의 거리"** 사용(표준 SDK의 `zIndex 동률 시 화면 하단 우선` 규칙과 같은 위치의 보조 기준). 이렇게 하면 사용자 아이디어의 "중앙 강조" 의도는 살리되 함정 1~3을 완화한다.
- 라벨만 숨기고 아이콘(핀)은 항상 유지 — 사용자 원안 그대로.
- 판정은 제스처 종료 시점 1회(기존 `vbSnap`/디바운스 패턴 재사용) — 매 프레임 재계산 금지, 히스테리시스(끌 때 임계값 < 켤 때 임계값) 적용.

---

## 5. 구체 접근안

### 접근안 A — "라벨 전용 greedy 우선순위 디클러터" (권장)

**동작 방식**: 렌더 시점(`vbSnap` 갱신 때)에 `markers` 배열을 화면 스크린 좌표(`(mx - vb.x)/vb.w * clientWidth` 등, 이미 컴포넌트 안에 계산 로직 있음)로 매핑 → 우선순위(선택됨 > 뱃지 > POI > 일반, 동률 시 화면 중앙과의 거리) 내림차순 정렬 → 순서대로 라벨 AABB(추정 폭 = 문자수 × fontSize × 0.6 근사, 다국어라 실측 대신 근사치로 시작)를 이미 배치된 라벨들과 비교해 겹치면 그 라벨만 스킵(아이콘/핀은 그대로 유지). 결과를 `Set<id>`(라벨 표시 대상)로 만들어 렌더 시 `m.label && visibleLabelIds.has(m.id) && <text>...`로 게이팅.

**구현 스케치**: `SaigonMapV5.tsx` 의 마커 렌더 블록(현재 976~1141줄) 직전에 `useMemo(() => computeVisibleLabels(markers, vb, containerSize), [markers, vbSnap])` 한 단계 추가. `computeVisibleLabels` 는 순수 함수로 새 파일(예: `components/maps/v2/labelDeclutter.ts`)에 분리.

**건드리는 곳**: `SaigonMapV5.tsx` 마커 렌더 루프(라벨 `<text>` 렌더 조건 3곳: biz 선택/비선택, poi, listing/feed) + 신규 유틸 파일 1개.

**회귀 위험**: 낮음~중간. 기존 "라벨 상시 노출" 을 기대하는 QA/사용자 습관과 달라짐(POI 라벨이 항상 보이던 것에서 조건부로 바뀜) — 최초 배포 후 "라벨이 안 보인다"는 문의 가능성. 순수 함수로 분리하면 로직 자체의 회귀 위험은 낮음.

**공수감(추정)**: 소~중. 화면 좌표 변환은 기존 `updateAnchorOverlay`(`SaigonMapV5.tsx:285-309`)에 이미 있는 패턴을 재사용 가능 — 새로 개발할 부분은 우선순위 정렬 + AABB 겹침 판정 + 결과 캐싱/히스테리시스뿐.

---

### 접근안 B — "픽셀 거리 임계값 + 중앙 강조" (사용자 원안에 가장 가까움, 단순)

**동작 방식**: 라벨 텍스트 폭 추정 없이, 마커 간 화면 픽셀 거리가 임계값(줌 종속, 예: `vb.w * k`) 미만이면 그룹으로 묶고, 그룹 내에서 "화면 중앙과 가장 가까운 1개"만 라벨을 남기고 나머지는 defocus. 사용자가 원안 그대로 묘사한 방식.

**구현 스케치**: 접근안 A 와 동일 위치에 삽입하되, 정렬 기준을 전부 "중앙 거리"로 단순화(1차 기준=우선순위 랭크 없이 오직 중앙거리).

**건드리는 곳**: 접근안 A 와 동일한 위치.

**회귀 위험**: §4.2 함정 그대로 노출 — 선택 핀이 화면 중앙이 아닐 때 엉뚱한 핀이 강조되거나, 팬 중 강조 대상이 자주 바뀔 수 있음(히스테리시스로 일부 완화되나 근본 해결은 아님). 라벨 텍스트 길이를 무시하므로 긴 업체명끼리는 여전히 겹칠 수 있음(오탐/미탐 존재).

**공수감(추정)**: 소(접근안 A 보다 더 단순 — AABB 계산이 없음).

---

### 접근안 C — "줌 종속 라벨 밀도 상한 + 클러스터 배지 확장" (구조적 대안)

**동작 방식**: 개별 충돌 판정 대신, 이미 있는 LOD 체계(`L1/L2/L3_VBW`)를 한 단계 세분화해 "L2 진입 직후" 같은 구간에서도 라벨 노출 개수 자체에 상한을 두고(예: 화면당 라벨 N개, 우선순위 상위 N개만), 초과분은 기존 "구역 카운트 뱃지" 패턴을 동 단위보다 더 작은 grid cell 단위로 확장해 뭉친다.

**구현 스케치**: 신규 grid 집계 로직(백엔드 또는 프론트 클라이언트 사이드 집계) + 기존 `districtBadges` 패턴 재사용.

**건드리는 곳**: `SaigonMapV5.tsx` LOD 게이트 로직 전반 + 신규 grid 집계(프론트 또는 백엔드 API) — 접근안 A/B 대비 변경 범위가 크다.

**회귀 위험**: 높음 — 기존 LOD/뱃지 로직과 얽혀 있어 사이드이펙트 범위가 넓고, "라벨 N개 상한"의 N을 정하는 기준 자체가 새로운 UX 결정 필요.

**공수감(추정)**: 대. 마커 수가 현재 규모(~200~300)에서 이 정도 구조 변경을 정당화할 만큼 심각한 문제는 아직 아님(§3 참조).

---

### 추천안: **접근안 A**

**근거**:
1. 사용자 원안("중앙 강조 + 인접 defocus")의 핵심 의도(라벨만 숨기고 아이콘 유지, 인접 시 하나만 강조)를 그대로 살리면서, §4.2 에서 지적한 함정(선택 핀 무시, 팬 중 깜빡임)을 "우선순위 랭크 1차 + 중앙거리는 타이브레이커"로 완화한다.
2. §2 조사한 5개 표준 SDK가 공통으로 쓰는 **priority-based greedy collision** 원리와 정합적이라 향후 유지보수자가 "왜 이렇게 짰는지" 표준 문서를 참조해 이해할 수 있다.
3. 기존 코드베이스에 이미 있는 패턴(화면좌표 변환 `updateAnchorOverlay`, 제스처 종료 시 1회 재계산 `vbSnap`, 중앙거리 계산 `NeighborhoodMap.tsx` 자동말풍선)을 재사용하므로 신규 개념 도입이 최소화된다(카파시 원칙 — 요청 이상 기능 추가 금지와도 부합, 접근안 C 처럼 구조를 새로 만들지 않는다).
4. 현재 마커 규모(~200~300)에서 O(n²) 겹침 검사도 충분히 저렴해 접근안 C 의 grid/클러스터 확장 없이도 성능 문제가 없을 것으로 추정된다.

---

## 6. 미결정 / 사용자 결정 필요 사항

1. **"화면 중앙"의 정의**: 지도 뷰포트 기하 중심 그대로 쓸지, 하단 시트 가림 영역을 뺀 "실제 보이는 영역"의 중심으로 보정할지 — 기존 자동 말풍선도 이 보정을 안 하고 있어 이번에 같이 고칠지 별도로 남길지 결정 필요.
2. **선택된 핀(포스트 패널 포커스)과 중앙 강조가 다를 때 무엇을 우선할지**: 접근안 A 는 "선택됨"을 1순위 랭크로 이미 반영하지만, 이게 사용자가 원하는 동작인지(즉 "탭한 핀은 화면 중앙이 아니어도 항상 라벨 유지") 확인 필요.
3. **라벨 폭 추정 vs 실측**: 근사치(문자수×평균폭)로 시작할지, 초기부터 `canvas.measureText` 캐시로 정확도를 높일지 — 베트남어 diacritics 폭 차이가 근사치 오차를 키울 수 있어 실제 겹침 사례(Dan Sinh market ↔ Chùa Phụng Sơn)로 근사치 정확도를 먼저 검증해볼 필요.
4. **라벨 노출 개수 상한을 둘지 여부**: 접근안 A/B 는 상한 없이 "겹치면 숨김"만 하므로, 아주 밀집된 지역에서 여전히 많은 라벨이 동시에 남을 수 있다(각각은 안 겹치지만 화면이 빽빽) — 상한이 필요하면 접근안 C 요소를 부분 도입해야 함.
5. **히스테리시스 계수**: 라벨을 껐다 켜는 임계값 차이를 얼마로 둘지는 실제 사용 테스트 없이는 추정치라 튜닝이 필요하다.
6. **POI "라벨 상시 노출" 정책과의 충돌**: 현재 POI 는 "이름 라벨 상시 노출"로 명시적으로 설계되어 있다(`SaigonMapV5.tsx` 주석) — 디클러터 도입 시 이 정책을 깨는 것이 되므로, POI 라벨도 디클러터 대상에 포함할지 사용자 확인 필요(이번 조사의 예시 자체가 POI 대 POI 겹침이라 포함이 맞아 보이지만, 기존 설계 의도와 상충되므로 명시적 확인 권장).
