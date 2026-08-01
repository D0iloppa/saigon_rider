# SaigonDistrictMap 마커 District 집계 배지

> **상태**: 🟢 코드완료, 시각검증 대기 (2026-05-28)
> **Task ID**: `260528_map_marker_projection` (기존 ID 유지, 컨셉 변경)
> **작업 위치**: worktree `.claude/worktrees/map-marker-cluster` (branch `worktree-map-marker-cluster`), main checkout 에도 cp 전파됨 (dirty change 로 보임)
> **선행 대화**: 2026-05-28 — 개념 설계 단계에서 bbox affine 접근이 실서비스 UI 로 부적합하다고 판단, **district 집계 배지** 방식으로 전환.
> **관련 코드**:
> - `frontend/src/components/maps/SaigonDistrictMap.tsx` (마커 렌더링)
> - `frontend/src/components/maps/district-data.ts` (`findNearestDistrict`, `gpsToSvg`) — 본 task 에서 미변경
> - 호출자: `pages/info/InfoGasList.tsx`, `pages/info/InfoRepairList.tsx`, `pages/info/InfoHub.tsx`, `pages/home/WorldMap.tsx`, `pages/info/InfoFloodMap.tsx`

---

## 🔁 다음 세션 핸드오프 (2026-05-28)

> 이 섹션만 읽고도 이어받을 수 있게 작성. 아래 "문제"/"컨셉" 섹션은 배경 설명용.

### 현재 상태

- **코드**: 구현 완료. TypeScript `tsc -b` 통과 (worktree 에서 검증).
- **시각 회귀**: 미검증 (background session 에서 브라우저 띄울 수 없음).
- **diff 위치**: main checkout (`/mnt/c/DEV/saigon_rider`) 에 dirty 상태로 propagate 됨. `git diff frontend/src/components/maps/SaigonDistrictMap.tsx` 로 +146/-75 확인 가능.

### 변경 요약 (한 파일)

`frontend/src/components/maps/SaigonDistrictMap.tsx`:

1. **`MAX_ZOOM` 상수** 4 → 6 (작은 sub-district 도 줌인 시 또렷이 차도록)
2. **`svgMarkers` useMemo 폐기** → 두 개로 분리:
   - `meMarkers`: 'me' 타입만, 그대로 단일 마커 렌더 (집계 비대상)
   - `aggregatedBadges`: 그 외 모든 타입을 (district code × type) 으로 그룹핑, 그룹 1개당 `{ districtCode, type, count, pos }` 1개 산출
3. **배지 SVG 렌더링** (새 블록, 기존 마커 분기 5종 대체):
   - 위치 = `district.label.x/y` (디자인 좌표 그대로 사용, 추가 데이터 0)
   - 표시 = `<circle r=9>` + 카운트 텍스트
   - 색 = `BADGE_COLOR` 테이블 (`gas:#3B82F6`, `repair:#F59E0B`, `flood:#EF4444`, `custom:#6B7280`)
4. **카운터 스케일**: `transform="translate(x,y) scale(1/zoom)"` 적용 (me + badge 양쪽).
   줌인해도 SVG 단위 r=9 가 화면상 일정 크기 유지.
5. **`focusOnDistrict(code)` 헬퍼** 추출 (기존 focus useEffect 의 zoom/pan 계산을 useCallback 으로 빼냄):
   - `focusDistrictCode` prop 변화 시 useEffect 가 호출
   - 배지 onClick 도 직접 호출 → 동일 배지 재탭도 재줌인 작동 (state 우회)
6. **import 정리**: `getBrand`, `formatPriceShort` 사용 안 함 → 삭제. `GasMarkerData` export 는 InfoGasList 가 import 하므로 유지.

### 검증해야 할 것 (다음 세션 작업)

다음 순서로 브라우저(또는 빌드 결과) 시각 확인:

1. **빌드**: `cd frontend && npm run build` — 통과해야 함 (worktree 에서는 `tsc -b` 만 검증)
2. **dev server**: `npm run dev` 후 모바일 모드(Chrome devtools) 로 열기
3. **InfoGasList** (`/info/gas`):
   - 지도 탭 클릭 → District 1 자동 줌인 (이슈 A 기존 동작)
   - 마커가 **`District 1: 10` 배지 1개** 로 표시되는지 확인 (이전: 한 점에 떡칠)
   - 배지 탭 → 해당 district 폴리곤 줌인 (재탭 시에도 재줌인 동작)
   - 줌인 후 배지가 거대해지지 않고 화면상 일정 크기 유지 (카운터 스케일 동작 확인)
4. **InfoRepairList** (`/info/repair`): 동일하게 확인 (마커 타입만 `repair`)
5. **InfoHub** (`/info`) 미니맵:
   - 마커들이 district 별 1배지로 보임 (interactive=false 이므로 탭 동작 무관, 시각만 확인)
   - 너무 작게 깨지지 않는지 (mini-map 작은 화면에서 r=9 가 적정한지)
6. **InfoFloodMap** (`/info/flood`):
   - `<FloodHotspotLayer>` (children) 와 `<FloodMarker>` 들이 정상 표시 (이들은 markers prop 미사용, 영향 없어야 함)
   - 만약 어딘가에서 `markers` prop 으로 flood 를 전달하는 곳이 있으면 그건 배지로 집계됨 (해당 없을 것)
7. **WorldMap** (`/`) 홈: markers 미사용이라 변경 없음, 시각 회귀만 확인

### 잠재 이슈 / 결정 메모

- **gas 브랜드 색·24h 표식·가격 표식 사라짐**: 의도된 trade-off. 배지는 카테고리 색 하나만 표시. 개별 브랜드/가격은 list view 에서 확인.
- **InfoHub mini-map 의 배지 가독성**: r=9 가 mini-map 에서 너무 클 수도 있음. 시각 확인 후 height 비례로 r 조정 필요할 수 있음 (현재는 r 고정).
- **MAX_ZOOM=6 vs 8**: 가장 작은 sub-district (D1 의 Bến Nghé 등 25x30 SVG 단위) 줌인 시 화면 60% 채우려면 zoom 5.6 정도 필요. 6 면 충분하나, 화면 채움이 부족하면 8 로 올려도 됨 (focus useEffect 의 0.6 비율도 조정 가능).
- **gpsToSvg 미변경**: `FloodHotspotLayer` 가 사용 중. 본 task 의 컨셉 (집계) 과 별개라 그대로 둠. 향후 정공법(실 지도 도입) 시 같이 정리.

### 다음 작업 (시각 검증 완료 후)

- 검증 OK → 본 task 파일을 `DONE` 으로 표시, `current.md` 업데이트, archive 이관
- 검증 NG (배지 크기·색·동작 이슈) → 본 파일에 발견 항목 기록 후 후속 수정
- 별도 후속 task 후보: **`260529_real_map_integration` (가칭)** — Leaflet/MapLibre + OSM 타일 도입으로 InfoGasList/RepairList 의 실 GPS 마커 페이지 정공법. 본 task 의 집계 배지는 그 때까지 임시 UI (그 후엔 InfoHub mini 만 집계 배지 유지).

---

## 문제

`SaigonDistrictMap.tsx:130-136` 의 마커 좌표 변환이 lat/lng → nearest district 의 라벨 좌표 한 점으로 스냅. 같은 district 안 마커 N개가 모두 한 점에 떡칠됨. District 1 줌인 시 주유소 10개가 한 점에 겹침.

## 컨셉 — District 집계 배지

개별 마커 위치를 분산하는 대신, **district 단위로 집계해 1배지/1district** 로 표시.

- 마커 좌표 = nearest district 의 `label.x/y` (디자인 좌표 그대로 사용)
- 표시 = 카운트 + 카테고리 색
- 같은 district 의 같은 카테고리 마커들이 자동으로 1배지로 합쳐짐
- 배지 탭 → 해당 district 로 줌인 (개별 위치는 list view 에서 확인)

**왜 이게 honest 한 UI 인가**:
- `district-data` 는 디자인 좌표라 GPS 엄밀 투영 불가 — 개별 위치 분산은 가짜 정보
- 라이더는 어차피 list page 에서 항목 선택, 지도는 "어느 동네에 몇 개" 만 필요

## 폐기된 접근

- **bbox affine 보간** (구 Option 1) — district 내부 분산이지만 위치 의미 없음, 마커 N개 늘면 여전히 겹침
- **전역 WebMercator** (구 Option 2) — 디자인 좌표와 정합 안 됨
- **radial jitter** (구 Option 3) — 의미 없음
- **실 지도 컴포넌트 도입** (Leaflet/MapLibre) — 정공법이나 본 task 범위 초과, 별도 후속 task 가능

## 사전 결정 사항

1. **카테고리당 1배지** (gas/repair/flood). InfoGasList/RepairList 는 단일 카테고리 페이지라 항상 1배지/1district.
2. **MAX_ZOOM = 4 → 6**. district 줌인 시 배지가 또렷이 보이도록.
3. **배지 탭 동작 = 해당 district 줌인**. 같은 페이지에 list 가 보이므로 list로 navigate 불필요.
4. **카운터 스케일** (`1/zoom`) — 줌인해도 배지가 화면상 일정 크기 유지.
5. `InfoFloodMap` 의 `FloodHotspotLayer` (children) 는 별도 좌표계로 직접 그림 → 본 task 영향 없음.
6. 이슈 A (focusDistrictCode 자동 설정) 는 이미 머지됨, 본 task 와 독립.

## 작업 체크리스트

1. `SaigonDistrictMap.tsx` — `svgMarkers` 매핑을 district 별 집계로 변경
   - 입력 markers 를 nearest district 로 그룹핑
   - 그룹마다 1배지 (count, type, label)
   - 배지 위치 = `district.label.x/y`
2. 배지 SVG 렌더링 — circle + count text + 카테고리 색
3. `MAX_ZOOM` 상수 4 → 6
4. 마커/배지 그룹에 카운터 스케일 (`transform={... scale(${1/zoom})}`)
5. 배지 `onClick` → 내부 focus 로직 호출 (지금은 prop 로 받는 `focusDistrictCode` 가 외부 제어이므로, 내부 state 추가 또는 부모 콜백 옵션 노출)
6. `gpsToSvg()` 는 그대로 유지 (deprecate 안 함, 다른 페이지에서 fallback 으로 쓸 수 있음)
7. 회귀 검증 — 5개 사용처

## 검증 기준

- District 1 에 주유소 10개 → `District 1: 10` 배지 1개로 표시
- 줌인 시 배지가 화면상 일정 크기 유지 (카운터 스케일 동작)
- MAX_ZOOM=6 으로 가장 작은 sub-district 도 화면 60% 이상 채움
- 호출자 5개에서 시각 회귀 없음

## Out of Scope

- 실 지도 컴포넌트 (Leaflet/MapLibre) — 후속 task
- 멀티 카테고리 배지 (한 district 에 gas+repair 동시 표시) — 필요 시 확장
- 클러스터링 라이브러리 — district 집계로 충분
