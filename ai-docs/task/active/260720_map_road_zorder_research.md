# 동네지도 도로 draw-order / z-순서 — 조사 (의사결정용)

> 작성일: 2026-07-20
> 상태: **조사 완료 — 사용자 결정 대기 (코드 미수정)**
> 범위: 코드 수정 없음. `SaigonMapV5.tsx`(1263줄) 전체 + `scripts/gen_saigon_map_v2.py`(데이터 파이프라인) Read + 웹 조사(WebSearch/WebFetch, 1차 공식 문서 우선) 기반.

---

## 0. 문제 요약

동네지도에서 **흰색 이면도로(서브)가 노란색 간선도로(메인) 위에 그려져 침범**한다. 사용자 의견: "중요도 기준 z-index — 메인이 top, 서브가 bottom." 이 문서는 (1) 현행 draw-order 확정(근본원인), (2) 표준 지도서비스 관행 조사, (3) 사용자 의견 평가, (4) 조치안 A/B/C + 추천, (5) 미결정 사항을 담는다.

---

## 1. 현행 드로우 오더 — 확정 결론

**결론: 도로 등급 데이터는 이미 존재하고 폭(w) 기준으로 이미 정렬도 하고 있다 — 그런데도 침범이 나는 이유는 정렬이 아니라 "casing 전체 → fill 전체"를 **모든 등급을 섞어서** 한 번에 그리는 2-pass 구조 자체의 구조적 결함이다.**

### 1-1. 레이어 구조 (SaigonMapV5.tsx)

- 좌표계: `lx()/ly()` 로 lat/lng → 통합 SVG 유닛(`BASE_W=10000`) 선형 변환 (24-43행). 지도 SDK 없음, 순수 SVG DOM.
- 최상위 `<svg>` 안에 depth1/depth2/depth3가 **nested `<svg x y width height viewBox>`** 로 지리적 bbox 위치에 배치되고, **SVG DOM 순서 = 페인트 순서**(나중에 그려진 것이 위):
  1. 배경(바다) `rect` (896행)
  2. **Layer 1**(항상): `depth1.wards`/수로/wline — 동 경계 (899-921행)
  3. **Layer 2**(vbW<35%): ward별 nested `<svg>` — 블록 폴리곤만, 도로 없음 (924-938행)
  4. **Layer 3**(vbW<7%): ward별 nested `<svg>` — water → wline → 건물 그림자 → **건물** → **도로(casing pass 전체 → fill pass 전체)** (941-970행)
  5. 선택 동 오버레이 → 동 라벨 → 마커 → 내 위치 dot
- 도로/건물 지오메트리 출처: `frontend/public/maps/v2/<ward-slug>/depth3.json` — 정적 파일, 빌드 시 `scripts/gen_saigon_map_v2.py` 가 Overpass(OSM) API에서 생성(런타임 API 아님, 사전 생성 에셋).

### 1-2. 도로 등급 데이터는 **있다** (가정 아님 — 확인)

`scripts/gen_saigon_map_v2.py:28-33`:
```python
ROAD_STYLE = {
    'motorway': ('#F4A93C', 5.5), 'trunk': ('#F4A93C', 5), 'motorway_link': ('#F4A93C', 3), 'trunk_link': ('#F4A93C', 3),
    'primary': ('#F6C453', 4), 'primary_link': ('#F6C453', 2.5), 'secondary': ('#FBD980', 3), 'secondary_link': ('#FBD980', 2),
    'tertiary': ('#ffffff', 2.4), 'residential': ('#ffffff', 1.8), 'living_street': ('#ffffff', 1.6),
    'unclassified': ('#ffffff', 1.6), 'pedestrian': ('#EDE6DA', 1.8), 'service': ('#f6f6f6', 0.9),
}
```
OSM `highway=*` 태그(motorway~service, 6단계 랭크)를 **색(c) + 폭(w)** 두 필드로 이미 변환해 depth3.json 의 `roads: {p, c, w}[]` 에 저장한다. 즉 **등급 정보는 색과 폭 둘 다에 인코딩**돼 있다 — "등급 필드가 없어서 정렬 불가"인 상황이 아니다.

단, 폭 값이 등급과 100% 단조 대응은 아니다 — 예: `tertiary`(이면도로, w=2.4)가 `secondary_link`(FBD980, w=2)보다 **폭이 크다**. 폭만으로 등급을 역산하면 이런 경계 케이스에서 순서가 어긋난다(§4 조치안에서 다룸).

### 1-3. 도로 렌더 코드 — 근본원인이 있는 지점

`SaigonMapV5.tsx:414-443` (로딩 시 1회):
```ts
d.roads.sort((a, b) => a.w - b.w);
// 폭 오름차순 정렬 — 2-pass 렌더의 fill pass 에서 상위 등급 도로가 위에 그려진다 (캐시 전 1회)
```
`SaigonMapV5.tsx:959-967` (렌더 시 매번):
```tsx
{/* 도로 2-pass: casing 전체 → fill 전체 — fill 이 교차부 casing 을 덮어 자연 병합된다 */}
{d.d3.roads.map((road, ri) => ROAD_CASING[road.c] ? (
  <polyline key={`c${ri}`} points={road.p} stroke={ROAD_CASING[road.c]}
    strokeWidth={road.w * roadK * CASING_RATIO} className={styles.road} />
) : null)}
{d.d3.roads.map((road, ri) => (
  <polyline key={ri} points={road.p} stroke={ROAD_FILL[road.c] ?? road.c}
    strokeWidth={road.w * roadK} className={styles.road} />
))}
```

**이게 왜 침범을 만드는가**: 정렬 자체(오름차순, 좁은→넓은)는 맞는 방향이다. 문제는 렌더가 **등급별 casing-fill 쌍**이 아니라, **전체 도로의 casing을 한 번에 다 그리고, 그 다음에 전체 도로의 fill을 다시 처음부터 그리는 "글로벌 2-pass"** 라는 점이다. 최종 페인트 순서(아래→위)는:

```
[모든 도로의 casing, 폭 오름차순]  →  [모든 도로의 fill, 폭 오름차순]
```

즉 **가장 좁은 이면도로(#ffffff)의 fill 조차, 가장 넓은 간선(#F4A93C)의 casing보다 항상 위에** 그려진다. 두 도로가 교차/인접하는 지점(T자·Y자 교차로 등, stroke가 실제 폭을 가지므로 교차부 근방에서 기하학적으로 겹침)에서, 나중(전체 fill pass)에 그려지는 **이면도로의 흰 fill이 먼저 그려진 간선의 casing(어두운 웜톤 외곽선)을 덮어써서** 간선의 외곽선이 그 지점에서 끊기거나 지워진 것처럼 보인다 — 이것이 "흰색 이면도로가 노란 간선 위에 침범"으로 관찰되는 정확한 메커니즘이다.

간선 자신의 fill(같은 pass의 맨 마지막, 폭 최대라 마지막에 그려짐)은 항상 다른 모든 것 위에 오므로 간선 "중심선 자체"는 안 지워지지만, **간선의 casing(외곽선/테두리)** 이 하위 등급 도로의 fill에 의해 국소적으로 뭉개진다.

**가설 검증 결과**: 배경에 제시된 3가지 가설 중 ②(nested SVG 타일 순서 문제)는 기각 — ward 경계는 도로가 몰리는 교차로 지점과 통상 무관하고, 한 ward 내부에서도 동일 증상이 재현되는 구조. ③(z-index 개념 자체 없음)도 기각 — 폭 기반 정렬은 이미 존재. **①의 변형**(정렬은 하지만 "전역 2-pass" 설계가 casing/fill을 등급과 무관하게 다시 섞음)이 정확한 원인.

부가 원인(마이너): `gen_saigon_map_v2.py:120-121`의 `if ward_proj.intersects(ln): det_roads.append(...)` 는 ward 경계에 걸친 도로 way를 **클립 없이 전체 좌표로 통째** 각 ward에 중복 저장한다 — 인접 ward의 nested `<svg>`가 별도로 같은 도로를 다시 그릴 수 있어 경계 부근에서 서로 다른 ward의 draw-order가 한 번 더 섞일 수 있다. 근본원인은 아니지만 §4 조치안 검토 시 참고할 사항.

---

## 2. 표준 지도서비스의 레이어/도로 z-순서 처리

1차 공식 문서 기준.

| 표준 관행 | 근거 | 우리 코드와의 비교 |
|---|---|---|
| **레이어 스택 = 그리기 순서**(땅→물→토지이용→도로→라벨) | OSM Carto: "data is rendered in the exact same order as it is queried"의 layer stack (project.mml, landcover가 맨 아래·라벨이 맨 위) — [OSM Carto rendering process](https://ircama.github.io/osm-carto-tutorials/osm-rendering-process/) | 우리도 배경→경계→블록→건물→도로→라벨 순으로 유사 — 이 대분류 순서 자체는 문제 없음 |
| **도로는 등급별 "casing-fill 쌍"을 등급 순으로 반복** — "casing-fill-casing-fill-casing-fill" (등급마다 자기 쌍을 완결한 뒤 다음 등급으로) | Mapbox GL JS 이슈: "stacked roads are drawn casing-fill-casing-fill-casing-fill for each layer" — [mapbox-gl-js #1349](https://github.com/mapbox/mapbox-gl-js/issues/1349) | **우리는 이걸 안 지킴** — "casing 전체 → fill 전체"(글로벌 2-pass)라서 하위 등급 fill이 상위 등급 casing 위에 옴. 이게 §1 근본원인의 표준-이탈 지점 |
| **도로 클래스 랭크(z_order)로 2차 정렬, layer 태그(다리/터널)로 1차 정렬** — "ordered ... primarily by layernotnull ... and by z_order – which represents the hierarchy of road classes" | [Key:layer, OSM Wiki](https://wiki.openstreetmap.org/wiki/Key:layer) | 우리는 `layer` 태그(고가/지하) 처리가 아예 없음 — 데이터 파이프라인이 `layer` 태그를 읽지 않고 폭/색만 추출. 지상 평면 교차만 다루는 지금 스코프에선 당장 문제 안 됨(HCMC 도심 37개 동 스케일에서 고가/지하 교차가 실사용에 영향 줄 만큼 흔한지는 별도 확인 필요) |
| **건물/땅 폴리곤과 도로 casing/fill의 3자 순서 상충은 업계에서도 완전히 못 푼 문제** — "buildings below the fill but above the casing of roads... accepting visible casing gaps as a compromise" | [OSM Carto issue #172](https://github.com/gravitystorm/openstreetmap-carto/issues/172) | 참고 — 우리 코드도 건물을 도로보다 먼저(아래) 그림(958행 vs 960행) → 이 부분은 이미 표준과 같은 타협안을 취하고 있어 추가 조치 불필요 |

---

## 3. 사용자 의견 평가

사용자 직관: **"중요도 기준 z-index — 메인(간선)이 최상위, 서브(디테일)일수록 bottom."**

- **맞는 점**: 표준과 정확히 일치한다. OSM Carto의 z_order(등급별 랭크)도, Mapbox의 casing-fill 반복 패턴도 결국 "등급 낮은 것 먼저(아래) → 높은 것 나중(위)"이 골자다. 우리 코드도 이미 `w` 기준 오름차순 정렬로 이 방향을 시도하고 있었다 — 방향 자체는 틀리지 않았다.
- **놓친 뉘앙스**:
  1. **"top/bottom" 한 축만으로는 부족** — casing과 fill은 **같은 도로 안에서도** 별도 레이어라, "메인이 서브보다 위"를 말 그대로 구현하려면 "메인의 casing"도 "서브의 fill"보다 위에 있어야 한다. 지금 버그가 정확히 이 지점에서 생긴다 — 폭으로 정렬은 했지만 casing/fill을 등급끼리 짝짓지 않아서 사용자가 원하는 "메인이 진짜로 서브 위"가 casing 부분에서 깨진다.
  2. **폭(w) ≠ 등급의 완벽한 대리 지표** — §1-2에서 확인한 대로 `tertiary(2.4) > secondary_link(2)` 같은 역전이 있어, 폭 정렬만으로는 경계 케이스에서 오등급 정렬이 남는다.
  3. **고가/지하 교차(layer 태그)는 이번 스코프 밖** — 사용자 의견은 "중요도"만 언급했지만 표준은 여기에 "물리적 층(다리/터널)"을 별도 1차 키로 둔다. 우리 데이터엔 이 정보 자체가 파이프라인에서 추출되지 않는다(수집은 하지만 layer 태그를 버림) — 지금 증상(교차로 침범)과는 무관하지만, 향후 고가차도가 있는 지역을 다룰 때 재검토 필요.
- **결론**: 사용자 의견은 **방향은 정확**하고, 구현 시 "메인 top/서브 bottom"을 **등급별 casing-fill 쌍**으로 옮기면(= 표준 관행) 그대로 실현된다. 우리 데이터(색+폭)로 실제 구현 가능 — 새 데이터 수집 불필요.

---

## 4. 조치안 A/B/C

### 조치안 A — 등급별 casing-fill 페어 렌더 (추천)

- **동작**: 렌더 루프를 "전체 casing → 전체 fill" 2-pass에서 **"등급(색) 그룹별로 casing 그리고 바로 그 등급의 fill을 그린 뒤, 다음 등급으로"** 로 바꾼다. 등급 순서는 기존 `ROAD_FILL`/`ROAD_CASING` 맵의 6색 랭크(골목→이면도로→보행로→tertiary→secondary→간선)를 그대로 사용.
- **구현 스케치**: `d.d3.roads`를 로드 시 이미 `w` 오름차순 정렬해두므로, 렌더 시 `road.c`(색)로 그룹핑한 뒤 그룹을 6색 고정 순서(약함→강함)로 순회하며 그룹별 `{casing map, fill map}` 두 개를 연속 출력. 즉 지금의 `roads.map(casing) + roads.map(fill)` 두 줄을 `ROAD_ORDER.forEach(color => { roads.filter(c===color).map(casing); roads.filter(c===color).map(fill) })` 형태로 바꾼다(또는 로드 시 정렬 키를 `(랭크, w)` 튜플로 바꿔 그룹 경계를 미리 계산).
- **현행 코드 어디를 건드리나**: `SaigonMapV5.tsx` 435-438행(정렬 로직 — 랭크 우선 정렬로 교체) + 959-967행(렌더 2-pass → 등급별 순회로 교체). `scripts/gen_saigon_map_v2.py`는 불필요(기존 색 필드로 랭크 도출 가능).
- **회귀 위험**: 낮음. 순수 렌더 순서 변경 — 마커/라벨/줌 로직 무관. 다만 색상 랭크를 코드에 새로 하드코딩해야 함(`ROAD_FILL`/`ROAD_CASING` 키 순서와 일치시켜야 실수 방지).
- **공수감**: 작음(반나절 내). 정렬 함수 1개 + JSX 루프 1개 교체.
- **도로등급 데이터 의존성**: 이미 있는 `road.c`(색)만으로 충분 — 추가 데이터 불필요.

### 조치안 B — 폭(w) 기준 정렬을 "색 랭크 우선, 폭은 2차 키"로 보정 + 조치안 A 병행

- **동작**: A의 등급 그룹핑을 "색"이 아니라 "명시적 랭크 정수"(예: `RANK: Record<color, number> = {골목:0, 이면도로:1, 보행로:2, tertiary:3, secondary:4, 간선:5}`)로 코드화해, §1-2에서 발견한 폭 역전(tertiary 2.4 > secondary_link 2) 경계 케이스까지 안전하게 처리.
- **구현 스케치**: A와 동일한 렌더 구조에 정렬/그룹 키만 `RANK[road.c]`로 바꿈 — `w`는 그룹 내부의 순수 스타일링(선 굵기)에만 쓰고 정렬에는 안 씀.
- **현행 코드 어디를 건드리나**: A와 동일 지점 + `RANK` 상수 추가.
- **회귀 위험**: A와 동일 수준(낮음). 랭크 테이블이 `ROAD_FILL`/`ROAD_CASING` 키셋과 어긋나지 않게 유지보수 필요(둘 다 손대는 곳이 다르면 향후 색 추가 시 랭크 갱신 누락 위험 — 코드 리뷰 체크리스트에 추가 권장).
- **공수감**: A와 거의 동일(+10분, 상수 테이블 추가).
- **도로등급 데이터 의존성**: 없음(색 필드로 랭크 산출, 새 필드 불필요). **A보다 정확도가 높아 사실상 A의 하위호환 개선판** — 별도 채택이 아니라 A 구현 시 "랭크 키를 색 대신 정수 상수로" 정도의 차이.

### 조치안 C — 파이프라인에서 명시적 `rank` 필드를 depth3.json에 미리 굽기

- **동작**: `scripts/gen_saigon_map_v2.py`의 `ROAD_STYLE`에 3번째 요소로 `rank`(0~5)를 추가해 `roads: {p, c, w, rank}[]`로 데이터 자체에 랭크를 새로 굽는다. 프론트는 그 필드로 그룹핑만 하면 됨.
- **구현 스케치**: `ROAD_STYLE = {'motorway': ('#F4A93C', 5.5, 5), ...}` + `det_roads.append({..., 'rank': rank})`. 프론트는 B와 동일 렌더 구조를 쓰되 `RANK[road.c]` 대신 `road.rank`를 직접 읽음.
- **현행 코드 어디를 건드리나**: `scripts/gen_saigon_map_v2.py` (28-33, 121행) + **37개 ward 전체 depth3.json 재생성**(Overpass API 재호출, 네트워크/시간 소요) + `SaigonMapV5.tsx` 렌더 로직.
- **회귀 위험**: 중간 — 데이터 재생성 자체가 실패/지연 가능(Overpass rate limit, 엔드포인트 3종 페일오버 로직 있으나 스크립트 주석상 "OSM 갱신 시에만 재실행"이라 평소엔 안 돌리는 경로). 배포 시 37개 파일 전체 교체 필요.
- **공수감**: 중간(1일 내외 — 스크립트 수정 + 전체 재생성 실행 + 결과물 diff 검증).
- **도로등급 데이터 의존성**: **데이터 재생성 필요** — 색만으로 랭크를 프론트에서 산출하는 B와 달리 랭크를 데이터에 영속화. B가 이미 충분히 정확하다면 C의 이점은 "프론트 상수 테이블 관리 부담을 데이터 쪽으로 옮긴다" 정도뿐 — 실익 대비 재생성 비용이 큼.

### 추천안: **B (색 기반 명시적 랭크 + 등급별 casing-fill 페어 렌더)**

**근거**:
1. 근본원인(§1-3)을 정확히 겨냥 — "글로벌 2-pass"를 "등급별 페어"로 바꾸는 것이 표준 관행(§2, Mapbox casing-fill-casing-fill)과 정확히 일치.
2. A의 색 직접 비교보다 랭크 정수 테이블이 오탈자·매직스트링 비교 위험이 없고, §1-2에서 확인한 폭 역전 케이스까지 깔끔하게 처리.
3. **데이터 재생성 불필요**(C 대비) — 기존 depth3.json 그대로, 프론트 렌더 로직만 교체. 공수 작고 회귀 위험 낮음.
4. `layer`(고가/지하) 처리는 이번 스코프에 포함하지 않음 — 현재 증상과 무관하고, 데이터 파이프라인 확장(Overpass 쿼리에 `layer` 태그 추출 추가)이 필요해 별도 후속 과제로 분리하는 게 맞다(§5).

---

## 5. 미결정 / 사용자 결정 필요 사항

1. **A vs B 채택** — B를 추천했으나 "일단 가장 작은 변경(A)으로 빠르게 검증 후 필요하면 B로 굳히기"를 원하면 순서를 바꿀 수 있음. (A와 B는 구현 위치가 거의 동일해 전환 비용 낮음.)
2. **고가/지하 교차(OSM `layer` 태그) 처리 여부** — 현재 파이프라인이 이 정보를 아예 버리고 있다. HCMC 도심 37개 동 안에 고가차도/지하차도가 실사용상 안 보일 정도로 드문지, 아니면 이번 기회에 파이프라인까지 확장(조치안 C 성격)할지는 실제 데이터/스크린샷 확인이 필요 — **추정**: 도심 랜드마크급(예: Điện Biên Phủ 고가) 일부에만 존재할 것으로 보이나 코드로 확인된 사실은 아님.
3. **ward 경계 도로 중복 저장**(§1-3 부가 원인) — `gen_saigon_map_v2.py:120`의 클립 없는 저장 방식이 경계 부근 draw-order에 추가로 영향을 주는지는 실제 경계 지역 스크린샷으로 별도 확인 필요(이번 조치안 A/B로 대부분 해소될 가능성이 높지만 100% 보장은 아님).
4. **회귀 검증 방법** — 조치 후 "표준 도로 등급 정렬이 유지되는지"를 스크린샷 diff로 확인할 ward를 몇 곳 지정할지(교차로가 많은 ward 우선 — 예: ben-thanh, cho-lon 등 상업지구).

---

## 부록 — 출처

- [OSM Carto rendering process](https://ircama.github.io/osm-carto-tutorials/osm-rendering-process/) — 레이어 스택 = 그리기 순서
- [gravitystorm/openstreetmap-carto issue #172](https://github.com/gravitystorm/openstreetmap-carto/issues/172) — 건물/도로 casing/fill 3자 순서 상충, 업계 표준 타협안
- [mapbox/mapbox-gl-js issue #1349](https://github.com/mapbox/mapbox-gl-js/issues/1349) — "casing-fill-casing-fill-casing-fill for each layer" 반복 패턴
- [Key:layer, OSM Wiki](https://wiki.openstreetmap.org/wiki/Key:layer) — layernotnull(1차) + z_order(도로 등급 랭크, 2차) 정렬 원칙, 다리/터널 layer 값 규칙
