# 동네지도 저줌 카토그래픽 일반화 — 블록 경계 아티팩트 조사

- 작성: 2026-07-20 (조사 전용, 코드 수정 없음)
- 범위: `SaigonMapV5.tsx` + `v2/region.ts` + `scripts/gen_saigon_map_v2.py` + `SaigonMapV5.module.css` Read, 표준 지도서비스 웹조사
- 결론 선요약: **저줌에서 보이는 "가늘고 조각난 선"은 depth2 블록 폴리곤의 stroke(`.blk`, `#d6ceba` 1.2 고정폭)이며, 그 블록 자체가 간선도로(main road) 중심선을 polygonize 해서 만든 도형이라 도로처럼 보이지만, ward 경계에서 강제로 잘리고 닫히지 않은 도로 구간은 애초에 블록 edge로 남지 않아 "실낱같이 조각난 도로 유령"으로 보인다.** 데이터 자체는 정상이며 표현 방식(stroke 노출 + zoom 미대응 폭 + 무단순화)의 문제 — 사용자 진단이 정확했다.

---

## §1. 현행 저줌 렌더 확정

### 1.1 LOD 3단 구조
`SaigonMapV5.tsx:46-49`
```
L1_VBW = BASE_W * 0.60   // 6000 — 도시 전체, district 뱃지
L2_VBW = BASE_W * 0.35   // 3500 — 블록/도로 표시 (~5km) 진입점
L3_VBW = BASE_W * 0.07   // 700  — 건물 표시 (~1km) 진입점
MIN_VBW = BASE_W * 0.01  // 100  — 최대 줌인
```
- `showL2 = vb.w < L2_VBW` (3500), `showL3 = vb.w < L3_VBW` (700) — 둘 다 **"미만"** 조건이고 Layer3 는 Layer2 를 대체하지 않고 **위에 겹쳐 추가로 렌더**된다(`tsx:924-970`).
- 사용자가 말한 "디테일(도로/건물)이 안 보이는 구간" = **showL2 && !showL3**, 즉 `vb.w ∈ [700, 3500)` (~1km~5km 스케일). 이 구간에 렌더되는 건 정확히 두 가지뿐:
  1. Layer 1: ward(동) 폴리곤 + 수로 (`depth1.json`, 항상, `tsx:899-921`)
  2. Layer 2: **블록 폴리곤만** (`depth2.json`, `tsx:923-938`)
  - 진짜 도로 geometry(`depth3.roads`)는 `vb.w<700` 이 되어야 로드/렌더된다 (`tsx:430,487` needD3=l3, `tsx:941-969`). 즉 이 구간엔 실제 도로 정보가 전무 — 블록 경계가 유일한 "선"이다.

### 1.2 블록 폴리곤의 출처 — "메인 도로 조각"이 맞다
`scripts/gen_saigon_map_v2.py:133-147`:
```python
MAIN_ROADS = {'trunk','primary','secondary','trunk_link','primary_link','secondary_link'}  # line 27
...
for bk in polygonize(unary_union(main_lines)):        # main_lines = 위 등급 도로 중심선만
    inter = bk.intersection(ward_proj)                # ward 경계로 강제 clip
    ...
    blocks.append({'p': ring_poly(gg), ...})
```
- `blocks` 는 shapely `polygonize()` 로 **간선도로 중심선이 둘러싼 폐곡선 영역**을 뽑아낸 것 — 즉 블록의 border 좌표는 실제로 간선도로가 지나가는 경로 그 자체다(도로 폭이 아니라 중심선). 사용자 진단("블록 경계가 메인 도로망을 따라 잘려 만들어진 것")이 코드로 확인된다.
- 렌더는 `tsx:933-935`:
  ```tsx
  {d.d2.blocks.map((b, bi) => (
    <polygon key={bi} points={b.p} className={styles.blk} />
  ))}
  ```
  `SaigonMapV5.module.css:86-91`:
  ```css
  .blk { fill: #efeadd; stroke: #d6ceba; stroke-width: 1.2; stroke-linejoin: round; }
  ```
  → **fill(#efeadd)도 있지만 stroke(#d6ceba, 1.2)도 항상 함께 그려진다.** 이 stroke 가 "도로였던 좌표"를 다시 선으로 그리는 것 — 데이터상 도로 모양인 선을, 스타일상으로도 선으로 한 번 더 강조하는 이중 노출이다.
- **중요한 비대칭**: 진짜 도로(depth3, L3 전용)는 줌에 따라 폭이 커브 보정된다(`roadWidthK(vb.w)`, `tsx:88,811,960-967` — 저줌 쪽에서 얇아지지 않도록 지수 0.4 로 완만화). 반면 **블록 stroke(`.blk`)는 이런 스케일 보정이 전혀 없는 고정 1.2 유닛**이다. nested-SVG 구조상 ward-local 유닛→화면 px 환산 비율은 바깥 `vb.w`(줌)에 반비례하므로, **L2 구간 중 가장 줌아웃된 지점(vb.w≈3500, L2 진입 직후)에서 블록 stroke 가 가장 가늘게 보인다** — 정확히 사용자가 "저줌에서 가늘고 지저분하다"고 지적한 지점과 일치한다.

### 1.3 왜 "조각"인가 — 두 가지 메커니즘 확인
1. **폴리곤화 미폐합 구간 소실**: `polygonize()`는 선분들이 완전히 폐곡선을 이룰 때만 면을 만든다. OSM 간선도로 태깅이 중간에 끊기거나(다른 등급으로 전환, 미완성 매핑 등) 루프를 못 이루는 구간은 애초에 블록 edge 로 등장하지 않는다 — 남은 edge 는 "우연히 닫힌 루프에 속한 도로 조각"만 살아남은 부분집합이라, 전체를 보면 네트워크가 아니라 여기저기 끊긴 조각들의 집합으로 보인다.
2. **ward 단위 독립 생성 + 강제 클리핑**: `build_ward()` (`gen_saigon_map_v2.py:81-90`)는 **동(ward)마다 별도로** Overpass 쿼리(자체 bbox+6% 패딩)를 날리고, 그 결과 블록을 `ward_proj`(동 경계 폴리곤)로 **하드 클립**한다(`gen_saigon_map_v2.py:136`, `inter = bk.intersection(ward_proj)`). 그 결과 동 경계선 부근에서는 블록 edge 가 **실제 도로와 무관한 행정경계선에서 뚝 끊긴다** — 화면상 "어디로도 이어지지 않는 선분 끝"으로 보이는 원인.
3. **generalization(단순화) 전무**: 블록 필터는 `area >= 200`(`gen_saigon_map_v2.py:146`) 뿐이고 형태 단순화는 없다. 실측(`an-dong` 동, 57개 블록): 정점 수 최소 5·최대 81·평균 19.7개 — 표준 지도의 줌별 Douglas-Peucker 단순화(§2) 없이 **원본 해상도 그대로**를 L2 진입 시점부터 L3 임계 직전까지 동일하게 렌더한다. 즉 저줌일수록 화면 대비 정점밀도(디테일)가 과도해지는데 아무 보정이 없다.
4. (부가) `depth2.json`/`depth3.json` 스키마에는 `border`(ward clip 경계) 필드가 있지만 현재 렌더 코드 어디서도 사용되지 않는다(`grep` 결과 0건) — 무관한 dead data, 이번 조사 범위 밖이라 삭제는 제안하지 않고 언급만.

---

## §2. 표준 지도서비스 저줌 표현 조사표

| 항목 | 표준 관행 | 근거(출처) |
|---|---|---|
| 벡터 타일 generalization | 줌 레벨마다 Douglas-Peucker(기본) 혹은 Visvalingam 알고리즘으로 선/폴리곤을 **그 줌의 타일 해상도에 맞춰 재단순화**. 타일 경계에 맞춰 좌표를 그리드에 스냅하는 옵션도 있음. | [tippecanoe README](https://github.com/mapbox/tippecanoe/blob/master/README.md) (Mapbox 오픈소스 표준 타일러) |
| 저줌 도로 선택 | 도로 class(등급)별로 **줌 임계값이 다름** — 저줌엔 motorway/trunk/primary 등 "prominent features"만, secondary/tertiary/residential/service 는 확대해야 등장(selection 오퍼레이터). Streets v8 `road` 레이어는 최소 z3 이지만 "at lower-numbered zoom levels only the most prominent features are available"라고 명시. | [Mapbox Streets v8 tileset reference](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/) |
| 블록/parcel/토지이용 경계 | `landuse` 레이어는 **stroke 없는 fill 폴리곤**으로만 구성(class: residential/park/industrial 등) — 경계선을 그리지 않고 색면 대비로 구획을 표현. building 레이어 자체도 별도 최소줌 이상에서만 등장. | 동일 Mapbox Streets v8 문서 — landuse 레이어 섹션 |
| 저줌 "무엇을 그릴지" 판단 기준 | 기본값으로 다 그리지 않고, **피처타입별로 "이 줌에서 사용자에게 무슨 효용이 있는가"를 명시적으로 결정** — 효용이 불분명하면 드롭. | [openstreetmap-carto issue #2925 "Low-zoom: decide which features to render"](https://github.com/gravitystorm/openstreetmap-carto/issues/2925) |
| 저줌 도로 과밀 방지 사례 | OSM Carto 는 residential/unclassified/service 도로가 다 매핑되자 화면이 "over-crowded, bloblike"해져 줌별 노출 규칙을 재작업(로드 렌더링 대규모 리라이트, GSoC 프로젝트)한 전례가 있음 — 정확히 이번 이슈와 동형(피처를 다 그리면 저줌에서 지저분해짐). | [OpenStreetMap Carto/Lines wiki](https://wiki.openstreetmap.org/wiki/OpenStreetMap_Carto/Lines) |
| 이론적 배경 | Cartographic generalization 은 selection·simplification·aggregation·typification 4대 오퍼레이터로 구성된 정립된 학문 분야 — "저줌에서 조각/과밀"은 이 오퍼레이터들을 적용하지 않고 원본 해상도를 그대로 축소해서 보여줄 때 나타나는 전형적 실패 패턴으로 문헌에 기술됨. | Road Network Generalization 개념 정의([Atlas.co glossary](https://atlas.co/glossary/road-network-generalization/)), ICA 학술자료 |

**요지**: 표준 지도는 (a) 블록/parcel/land-use 경계선을 저줌에서 **stroke 하지 않는다** — fill 색면 대비로만 구획을 표현하고, (b) 도로는 "전부 아니면 전무"가 아니라 **등급별로 줌 임계값을 나눠 저줌엔 간선만** 보여주며, (c) 도형 자체도 줌별로 단순화한다. 우리 코드는 세 원칙 중 어느 것도 적용돼 있지 않다 — block stroke 노출 + depth3 전체(도로 포함) 일괄 게이팅 + 무단순화.

---

## §3. 개선안 A / B / C + 추천

### A안 — 블록 stroke 제거 (fill만, 또는 극저대비 stroke)
- **변경**: `SaigonMapV5.module.css` `.blk` 의 `stroke`를 제거하거나 배경(`.ward` fill `#e7e1d0`)과 명도차가 거의 없는 값으로 낮춘다.
- **시각효과 (before/after)**:
  - Before: 블록 사이사이로 갈색(#d6ceba) 실선이 성기게, 끊어진 채로 깔려 있어 "지도가 낡은 종이처럼 잔금이 간" 인상. 특히 화면 가장자리·동 경계 근처에서 선이 갑자기 끊기는 게 두드러짐.
  - After: 실선이 사라지고 완만한 베이지 색 패치(#efeadd)들이 지면(ward, #e7e1d0)보다 살짝 밝은 덩어리로만 남는다. 블록 사이의 "틈"은 그 아래 깔린 지면색이 얇게 비치는 것으로 대체 — 도로처럼 읽히던 선이 소멸하고 은은한 명도 얼룩만 남는다.
- **구현 스케치**: CSS 1줄 (`stroke: none;` 또는 `stroke: rgba(211,203,184,0.25)`). 로직 변경 없음.
- **현행 코드 영향**: 없음(스타일시트만). LOD 로직·데이터 파이프라인 무관.
- **회귀위험**: 매우 낮음.
- **공수**: 매우 작음 (< 30분, 스크린샷 확인 포함).
- **표준 근거 연결**: §2의 Mapbox `landuse` 레이어(stroke 없는 fill)와 정확히 같은 처방.
- **트레이드오프**: 이 구간(vb.w 700~3500)에 도로에 대한 시각적 단서가 **완전히 없어진다.** 지금은 조각나 지저분하긴 해도 "여기 대충 도로가 있다"는 힌트는 됐던 것 — A안 단독 적용 시 방향감이 오히려 사라질 수 있음(§4-1).

### B안 — 저줌 전용 "간선도로 스켈레톤" 라인 레이어
- **시각효과 (before/after)**: A안(블록 fill만)을 기본으로 깔고, 그 위에 **일정한 두께의 연속된 얇은 라인**으로 간선도로만 표시. Before(현재)의 "실낱같이 끊긴 여러 선"과 달리, After는 "몇 가닥 안 되지만 시작부터 끝까지 이어지는 굵기 일정한 도로선" — 표준 지도가 저줌에서 보여주는 "도시의 뼈대" 인상에 가까워진다.
- **데이터 이슈(확인 필요)**: 현재 `depth2.json` 스키마(`Depth2Data`, `tsx:23`)에는 `blocks`(폴리곤화 **결과**)만 저장되고, 원본 `main_lines`(간선도로 중심선 자체, `gen_saigon_map_v2.py:150` `depth2 = {**base, 'blocks': blocks}`)는 저장하지 않는다. `depth3.json` 의 `roads`에는 이미 간선 등급(trunk/primary/secondary — `ROAD_STYLE`, 색 `#F4A93C/#F6C453/#FBD980`)이 있지만, depth3 자체가 `showL3`(vb.w<700)에서만 로드된다(`tsx:430,487`).
  - 옵션 b-1: 파이프라인이 depth2 JSON에 간선도로 라인도 추가로 저장(Overpass 재쿼리는 필요하지만 로직은 이미 있는 `main_lines`를 직렬화만 하면 됨, `gen_saigon_map_v2.py:116` 근처).
  - 옵션 b-2: L2 구간에서도 depth3 를 프리페치하되 렌더링에서 간선 등급만 필터링. 단 depth3 파일이 depth2보다 커서(생성 로그 `sz2`/`sz3` 비교 시 depth3 쪽이 도로+건물+수로 포함이라 더 큼) 저줌에서 불필요한 트래픽/파싱 비용 증가.
- **현행 코드 영향**: `onViewportChange`의 `loadWardData(slug, l3)` 게이팅 로직 확장 또는 depth2 로더에 간선 필드 추가, 렌더에 새 `<polyline>` 블록 추가, `roadWidthK` 류의 별도 저줌용 폭 곡선 필요(현재 곡선은 L3 전용 스케일이라 L2 폭에 그대로 쓰면 안 맞을 가능성 — 추정, 실측 필요).
- **회귀위험**: 중간(새 레이어·게이팅 확장, 데이터 스키마 변경 옵션 포함).
- **공수**: 중간~큼.
- **표준 근거 연결**: §2 "등급별 줌 임계값 분리(selection)" — 저줌엔 간선만 노출하는 Mapbox/OSM Carto 관행과 동일한 방향.

### C안 — 파이프라인에서 저줌 전용 generalized geometry 별도 생성
- **시각효과**: 블록 경계 자체를 Douglas-Peucker 류로 단순화(정점 감소, 톱니 제거)하고, 지나치게 작은 블록은 인접 블록과 병합(typification/aggregation)해 저줌에서 "잘게 조각난 모자이크"가 아니라 "완만한 큰 덩어리 몇 개"로 보이게 한다.
- **구현 스케치**: `gen_saigon_map_v2.py` 에 `shapely.simplify(tolerance)` + 저줌 전용 `blocks_lod` 필드 추가, area 임계값(현재 200) 상향.
- **현행 코드 영향**: 파이프라인만, 렌더 코드는 vb.w 구간별로 다른 필드를 선택하는 분기만 추가.
- **회귀위험**: 낮음(구조적으로는) 하지만 **재크롤링 필요**(Overpass API, 스크립트 자체가 ward당 2.5s 슬립 + 응답시간 — 37개 ward 순회) + 단순화 강도 튜닝(반복 확인) 비용이 큼.
- **공수**: 큼.

### 추천: **A안 즉시 적용 + B안을 중기 후속으로**
- A안은 §2 표준 근거(land-use/parcel 은 저줌에서 stroke 하지 않고 fill만)와 정확히 일치하고, 공수·회귀위험이 최소이며 "조각선 노이즈"를 즉각 해소한다.
- 다만 A안 단독으로는 저줌 구간에 도로 관련 시각 정보가 전무해지는 트레이드오프가 있어(§4-1), 표준 지도들처럼 "간선만 골라 별도의 일정한 두께 라인으로"(B안)를 중기 후속으로 붙이는 게 정석적 해법이다.
- C안(형상 자체의 generalization)은 실측 정점 수(평균 19.7, 최대 81 — an-dong 동 표본)가 아주 과도한 수준은 아니라는 점(추정 — 시각적으로 문제가 되는 건 정점 밀도보다 stroke 노출+무보정 폭일 가능성이 큼)에서, A/B로 시각 문제 대부분이 해소될 것으로 보여 우선순위를 낮춘다.

---

## §4. 미결정 / 사용자 결정 필요

1. **A안 단독 적용 시 트레이드오프 수용 여부**: 저줌 구간(vb.w 700~3500)에 도로 관련 시각적 단서가 완전히 사라진다. "일단 노이즈부터 없애고 도로 스켈레톤(B)은 나중"으로 갈지, "처음부터 A+B를 묶어서" 갈지 결정 필요.
2. **B안 채택 시 데이터 스키마 변경 범위**: depth2에 간선 라인을 새로 저장(b-1)할지, L2에서도 depth3를 프리페치해 필터링(b-2)할지 — 전자는 파이프라인 재실행(Overpass 재크롤링, 대기시간 포함 수 분~십여 분)이 필요하고 후자는 런타임 트래픽/파싱 비용이 늘어난다. 트레이드오프 선택 필요.
3. **블록 stroke 제거 후 실제 시각 대비**: `.blk` fill(#efeadd) vs `.ward` fill(#e7e1d0)의 명도차가 매우 작아, stroke 없이 fill만으로 "블록 구획감"이 충분히 느껴질지는 실제 스크린샷/실기기로 확인해야 하는 디자인 판단 — 구현 단계에서 Fable 라우팅 권장(카파시 지침 §5: UI/디자인 고퀄 판단).
4. **저줌 블록 정점 밀도가 실제로 시각 문제를 일으키는지**: 이번 조사에서는 an-dong 1개 동(57블록, 평균 19.7 정점)만 실측했다 — 다른 동, 특히 정점 수가 많은 재래시장 밀집 구역 등에서도 C안 없이 A/B만으로 충분한지는 추가 표본 확인이 필요(추정 근거 약함).
5. **Before/After 시각 비교**: 이번 문서는 코드·근거 기반 서술로 묘사했을 뿐 실제 스크린샷 캡처는 하지 않았다(조사 스코프가 read-only+웹조사로 한정됨) — 구현 단계에서 실제 렌더 스크린샷으로 재검증 필요.
