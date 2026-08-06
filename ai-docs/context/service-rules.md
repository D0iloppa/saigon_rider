# 서비스 규칙 (Service Rules)

기능 구현 시 위반해서는 안 되는 도메인 불변식.

---

## GPS / 위치 서비스

> **전면 개정 2026-08-06** (대표 지시: *"기본을 다 gps로 / 안잡히면 전체지역으로 / 2개로만해 / 모든화면에서 / 지도 다나오게"*).
> 종전 원칙 1·2(**GPS 자동 측정 금지**, **지도 탐색에 GPS 미사용**, 전체↔선택지역 2모드)는 **폐기**됐다.
> 폐기 사유: 위치 SoT 가 3벌로 갈려 화면마다 다른 지역을 보여줬고, GPS 를 켜도 예전에 고른 지역이 기준이었다.
> 설계도 원문: [`ai-docs/260806_gps_scope_unification_design.md`](../260806_gps_scope_unification_design.md)

### 원칙

1. **표시 범위는 `'gps'` ↔ `'all'` 2개뿐이다.** 기본값은 `'gps'`(내 현재 위치). 사용자가 동을 골라 필터하는 **지역 선택은 폐기**됐다 — 시트 3번째 옵션, 지역칩(`AreaPill`), 지도 폴리곤 탭 선택, URL `rlat/rlng` 보존 전부 제거.
2. **모든 화면이 같은 기준을 쓴다.** 마켓·동네지도·홈·주유소·정비소·날씨·침수가 단일 SoT 를 구독한다. 화면별 독자 위치 상태를 만들지 말 것(마켓의 `mkt_filter_v2` 가 그 사고였다).
3. **`'gps'` 의 "근처" = 내 좌표 반경 `NEARBY_RADIUS_KM`(3km).** 행정구역(ward/district)으로 거르지 않는다 — 구 경계에 걸친 건이 통째로 빠지던 원인이다.
4. **측위 주체는 스토어 하나.** 화면은 `ensureLocation()` 을 부르기만 한다. 세션당 실측 1회(in-flight 공유)이며, 화면이 `native.getLocation()` 을 직접 부르면 화면 수만큼 권한창이 뜬다.
5. **좌표는 persist 하지 않는다.** 모드만 기억하고 세션마다 재측위한다 — 어제 좌표로 오늘의 "근처"를 계산하면 헤더와 목록이 어긋나는 회귀가 재발한다.
6. **진입 권한 프롬프트는 프리프롬프트로 완화한다.** 권한이 **미결정(`prompt`)일 때만** 자체 확인 다이얼로그(기존 전역 `ConfirmDialog` 재사용)로 목적을 먼저 알린다. "나중에"를 고르면 시스템 창을 띄우지 않고 `'all'` 로 가며, 이후 세션에서 다시 묻지 않는다.
7. **이동 추종은 앱 전역 1개**(2026-08-06 추가, 대표 지적 "페이지이동을 하지 않으면 위치가 반영되지 않는다"). `useLocationStore.startWatching()` 을 **`App.tsx` 에서만** 호출한다 — 화면마다 걸면 워처가 중복된다. `native.watchLocation`(이벤트 기반) 을 쓰고 폴링하지 않는다.
   - **30m 거리 게이트 필수**(`WATCH_MIN_MOVE_M`). GPS 는 정지 상태에서도 수 m 씩 튀는데 그대로 스토어에 반영하면 `coords` 를 deps 로 쓰는 목록·지도 조회가 초당 몇 번씩 재발화한다. 반경이 3km 라 30m 이하 흔들림은 결과를 바꾸지 않는다.
   - 서비스 권역 밖으로 이동한 tick 은 **무시**한다(마지막 유효 위치 유지).
8. **여전히 유효한 GPS 경로**: 경로안내(`RideNav`), 제보(주유/정비/침수 신고의 `native.getLocation()`).
9. **'전체 지역' 선택은 고정된다**(`pinnedAll`, 2026-08-06 리뷰 반영). `ensureLocation()` 은 6개 화면이 마운트마다 부르므로, 이 플래그가 없으면 권한을 허용한 사용자는 '전체 지역'을 골라도 다음 화면 진입에서 `'gps'` 로 원복된다. `permissionIntent('declined')` 로 겸하지 말 것 — 그건 "권한을 거부함"이지 "전체 지역을 원함"이 아니다.
10. **이동 추종은 좌표가 확정된 뒤에만 시작한다.** `native.watchLocation` 은 곧바로 OS 권한창을 띄우므로, 마운트 즉시 걸면 프리프롬프트(원칙 6)를 앞질러 그 장치가 무력화되고 로그인 전 화면에서도 권한창이 뜬다. `App.tsx` 는 `mode==='gps' && coords` 를 만족할 때만 건다.
11. **폴백 안내는 사유별로 1회**다. 하나의 불리언으로 묶으면 "권역 밖" 안내가 플래그를 소진한 뒤 나중에 권한 거부로 전체 지역이 돼도 아무 설명이 없다.
12. **dev 좌표 오버라이드**(`/dev/gps` 하네스 전용). `native.getLocation()`/`watchLocation()` 이 `localStorage.__dev_gps` 를 우선 반환한다. **2중 게이트** — 호스트 허용목록(localhost/127.0.0.1/saigon.doil.me) + 명시적 opt-in 키. 빌드타임 플래그(`import.meta.env.DEV`)를 쓰지 않는다: `frontend/Dockerfile` 이 `npm run build`(프로덕션 모드)라 **dev 스택에서도 `DEV` 가 false** 이기 때문.

### 폴백 정책 — "측위 실패"와 "권역 밖"은 다른 사건이다

| 상황 | 결과 mode | `coordsSource` | 기준 좌표 | 안내 |
|---|---|---|---|---|
| 측위 성공 & `inServiceArea` | `gps` | `device` | 실측 좌표 | 없음 |
| **측위 성공 & 서비스 권역 밖** | **`gps`** | **`fallback`** | **`BEN_THANH_FALLBACK`**(중심가) | `map.outsideArea` |
| 권한 거부(code 1) | `all` | — | 없음 | `map.listFirst.nearMeDenied` |
| 타임아웃(code 3) | `all` | — | 없음 | `map.listFirst.nearMeTimeout` |
| 측정 불가 / 위치서비스 꺼짐 | `all` | — | 없음 | `map.listFirst.nearMeUnavailable` |

- **권역 밖은 기존 동작을 유지한다** — 어디 있는지는 알고 서비스 범위 밖일 뿐이므로, 알리고 중심가로 안내한다. `'gps'` 를 유지하므로 반경 3km 필터가 그대로 걸려 목록이 비지 않는다.
- **측위 실패는 `'all'`** — 어디 있는지 모르는 상태에서 중심가로 보내면 "왜 여기냐"는 근거가 없다.
- **`BEN_THANH_FALLBACK` 을 측위 실패에까지 채우지 말 것.** 그게 모든 화면이 아무 설명 없이 Bến Thành 으로 수렴하던 직접 원인이다(2026-08-06 대표 캡처).
- 폴백 토스트는 **세션당 1회** — 화면 5개가 각자 띄우면 폭탄이 된다.
- **`coordsSource` 를 라벨에 반영할 것.** 권역 밖인데 "내 현재 위치"라고 쓰면 사용자가 결과를 오해한다.

### 단일 SoT — `useLocationStore` (전면 개정 2026-08-06)

- `store/useLocationStore.ts` — `mode: 'gps' | 'all'`, `coords`, `wardName`(**라벨 전용**), `coordsSource`, `permissionIntent`, `ensureLocation()`, `setMode()`.
- **`region` / `selectRegion` / `selectAll` / `useSelectedRegion` / `location` 스냅샷은 제거됐다.** persist 는 `version: 4` 로 올려 구버전 값(`mode:'region'`)이 되살아나지 않게 한다.
- **`wardName` 을 필터 판정에 쓰지 말 것** — 판정은 좌표 반경이다. 동 폴리곤은 중심부 37개만 커버해 그 밖에서는 라벨이 `null` 이 되는데, 이걸 판정에 쓰면 결과가 통째로 빈다.
- 정보 화면 공통 소비는 `hooks/useServiceLocation.ts`(→ `{ origin, fetchRadiusKm, label }`), 표시범위 시트는 `components/location/DisplayScopeSheet.tsx`(앱 공용 2옵션).
- **조회 반경은 `fetchRadiusKm` 하나로만 정한다.** `'gps'`=`NEARBY_RADIUS_KM`(3km), `'all'`=`ALL_AREA_RADIUS_KM`(12km, 37개 동 전역). 화면에 반경 상수를 따로 두지 말 것 — 종전 `FETCH_RADIUS_KM=3` 하드코딩 때문에 두 모드가 같은 결과를 냈다(2026-08-06).
  - fetch 콜백 deps 에 `fetchRadiusKm` 을 반드시 넣는다(빠지면 클로저에 고정돼 모드 변경이 무시된다).
  - **SWR 캐시 키에 반경을 포함**한다(빠지면 '전체'가 3km 캐시를 읽는다).
- **홈 카드와 상세 화면은 같은 기준으로 조회한다.** 홈(`HomePage`)의 날씨·침수·주유소·정비소 카드도 `useServiceLocation()` 을 쓴다 — 종전엔 홈만 동 centroid(`resolvedWard.center_*`)를 써서 건수가 어긋났다(대표 지적 2026-08-06: 홈 42/136 vs 상세 39/141). 반경 라벨(`home.v2.withinKm`)도 `fetchRadiusKm` 을 받아 표기한다.

### 화면별 적용

| 화면 | 기본값 | 표시 범위 변경 방법 |
|---|---|---|
| 마켓(MarketMain) | GPS 반경 3km | 헤더 지역명 탭 → `DisplayScopeSheet` 2옵션 |
| 동네지도(NeighborhoodMap/Canvas) | GPS 반경 3km | 헤더 지역명 탭 → `DisplayScopeSheet` 2옵션 |
| 홈(HomePage) | GPS 반경 3km | (전용 진입점 없음 — 다른 화면에서 바꾸면 함께 반영) |
| 정보-날씨/주유/정비/침수 | GPS | `LocationContextBar` 칩 탭 → `DisplayScopeSheet` 2옵션 |
| 제보(주유/정비/침수 신고) | — | `native.getLocation()` (GPS 유지) |
| 경로안내(RideNav) | — | GPS 유지 |
| 물건 등록 | 위치 없음 | 명시적 위치 선택 시에만 좌표 저장 (`LocationPickerSheet` — 표시범위와 무관한 별개 피커) |

### 지도 렌더 (개정 2026-08-06)

- **동 경계선(Layer 1)·동 이름 라벨은 항상 그린다.** `SaigonMapV5.tsx` 의 `Layer 1 (항상): 동 경계선 + 수로` 는 `polyActive` 와 무관하다.
- **`polyActive={false}` 로 통일한다** — 이건 *선택 동 강조*(주황 테두리 + 나머지 동 `.wardDim` 감쇠 + 선택 동 외 L2/L3 레이어 숨김) 스위치다. 지역 선택이 사라져 강조할 대상이 없고, 켜두면 지도가 잘려 보인다(대표 지시 "지도 다나오게").
- **카메라는 GPS 중심**(`locateOnMount`), 내 위치 파란 점은 항상(`meDotOnMount`).
- **우측 하단 '내 위치'(◎) 버튼을 켠다**(`showLocateControl`, 2026-08-06 복원). 이걸 끄던 근거가 폐기된 원칙 2 였다. 탭하면 재측위 후 **센터링 + L3 줌인**(`focusLatLng` 가 `L3_VBW*0.9` 로 맞춘다). 화면에 FAB 가 있으면 `bottomInsetPx` 로 겹치지 않게 띄운다(마켓 = 70).
- **마커 dot 기본색은 브랜드 주황(`#ff6f3c`)** 이다. 종전 기본값 `#3b82f6` 은 "내 위치" 파란 점과 같은 색이라 `color` 를 지정하지 않는 모든 도메인 핀(매물·주유소·정비소)이 내 위치와 구분되지 않았다(대표 지적 2026-08-06).
- **매물·피드는 비선택 = 원형 dot / 선택 = teardrop 핀**(`BIZ_PIN_PATH` + 도메인 글리프)이다. 이 형태 차이가 "선택됨"의 신호이므로 비선택까지 핀으로 올리지 말 것.
- **정보 화면 지도(주유소·정비소)도 `showLocateControl` + `meDotOnMount` 를 켠다** — 진입 즉시 내 위치 점이 찍혀야 한다(종전엔 ◎ 를 눌러야만 나왔다).
- **줌아웃 그루핑은 뷰포트 격자 클러스터링**이다(`lib/clusterPoints.ts`, 2026-08-06). 클러스터 좌표는 **구성원 무게중심**이고 대상은 목록과 같은 집합이라 **합계가 목록 건수와 일치**한다. 배지를 탭하면 그 지점으로 L3 확대(`onBadgeClick`).
  - 종전 구(district) 단위 집계 배지는 폐기 — 배지가 구 중심점에 찍혀 실제 지점과 어긋나고, 합계가 안 맞고(8+5+5=18 vs 목록 39), 기준 단위가 구(22개 레거시)라 지도의 동(37개)과 격자가 달랐다.
  - 격자 원점은 **절대좌표**여야 한다. 뷰포트 기준으로 나누면 팬 할 때마다 칸 경계가 움직여 클러스터가 깜빡이며 재편성된다.
  - 현재 적용 범위는 **주유소·정비소**뿐이다. 매물·업체 핀으로 넓히려면 별도 검증이 필요하다.
- **정보 화면의 지도 칩은 "지도 보기/지도 접기"** 다(`info.mapChipOpen`/`mapChipClose`). 지도와 목록이 한 화면에 공존하므로 "지도/목록" 배타 전환 라벨은 동작과 어긋난다(대표 지적 2026-08-06).
- **'확대해서 주변 보기' 힌트 필**은 하단 가운데에 둔다(우하단은 ◎·FAB 와 겹친다). 노출 조건은 **L3 미도달**(`onDepthChange` 의 2번째 인자 `belowL3`)이며, 데이터 게이트(`markerDepth`)와 분리한다 — 마켓은 L2 에서 이미 핀이 보이지만 힌트는 L3 까지 유도해야 한다. 탭하면 내 위치가 아니라 **현재 지도 중앙**을 확대한다.
- **L2 줌 게이트는 유지한다** — 멀리서 볼 때 확대를 유도하는 장치라 존치(대표 확인 2026-08-06). 게이트 미만에서는 지도·시트 모두 비우고 확대 안내 필을 노출한다.

### 회전(나침반) — `enableFollowCompass` (제정 2026-08-06, [`260806_svg_map_v6_rotation_design.md`](../260806_svg_map_v6_rotation_design.md))

- **`SaigonMapV5` 는 `enableFollowCompass` prop 이 있어야만 카메라 추종·나침반 회전이 켜진다.** 미전달 8개 소비처(위치 피커·정보 지도 등)는 기존 동작과 완전히 동일하다(킬스위치). 배선된 곳은 **동네지도(`NeighborhoodMapCanvas`)·마켓지도(`MarketMain`)뿐**이다.
- **기본은 여전히 미추종(표시 전용, `followMode:'free'`)이다.** 사용자가 ◎ 버튼을 눌러야 [자유→추종→추종+나침반] 3-state 로 전환되며, **팬·핀치 제스처는 즉시 자유 모드로 되돌린다.** 상시 follow 금지(§경로 안내 "탐색과 안내는 분리한다"와 동일 원칙).
- **나침반 모드에서는 L3(건물)를 렌더하지 않는다(L2 고정).** 회전 시 화면을 덮으려면 뷰포트가 오버스캔(√2, 45°에서 면적 2배)돼야 하는데, L3 피처가 그만큼 늘면 저사양 기기에서 프레임이 무너진다.
- **heading 소스는 GPS course-over-ground 단일**이다(자력계 DeviceOrientation 미도입). 데드존 8°, `speed < 1.5 m/s` 이거나 `heading`/`speed` 가 `null` 이면 회전하지 않고 **마지막 유효 방위를 유지**한다.
- **회전 계층은 SVG 내부 `<g transform="rotate(...)">` 하나뿐이다.** 루트 `<svg>` 에 CSS `transform` 을 걸지 말 것 — `getBoundingClientRect()` 가 부풀어(각도에 따라 최대 √2배) 팬·탭·휠 제스처가 조용히 틀어진다.
- **`preserveAspectRatio="none"` 이라 `vb.h = vb.w × 컨테이너비율` 불변식이 깨지면 회전이 전단(shear)으로 보인다.** 나침반 진입·컨테이너 리사이즈(`ResizeObserver`) 시 이 비율을 재계산해 유지한다.
- **이 두 화면(동네지도·마켓지도) 외 6곳에는 회전·추종을 켜지 않는다** — 위치 피커(`BizLocationPicker`·`LocationPickerSheet`)·정보 지도(`InfoFloodMap`·`InfoGasList`·`InfoRepairList`)·`BizPublic`. 탐색 목적이 아니거나 특정 위치 선택이 목적인 화면에서는 추종/회전이 방해가 된다.

---

## 경로 안내 (nav) — 제정 2026-08-06

`RideNav.tsx`(`/ride-nav?type=nav`) 전용. 지도는 `components/ride/MapCanvas.tsx`(maplibre + OpenFreeMap) 이며 동네지도(`SaigonMapV5`, 자체 SVG)·위치선택(`maps/OsmMap.tsx`)과 별개 컴포넌트다.

- **탐색과 안내는 분리한다.** 진입 시엔 `fetchRoute()` 로 경로만 받아 개요를 보여주고, 카메라 연출·GPS watch·이탈 판정은 사용자가 **[경로 안내 시작]** 을 탭할 때(`startGuidance()`)만 켠다. 두 개를 한 함수로 합치면 `guidanceStarted` 가 `route` 와 같은 배치로 켜져 **시작 버튼이 렌더될 프레임이 사라진다**(2026-08-06 회귀).
- **경로 재탐색은 안내 1회당 `MAX_REROUTES = 2` 회까지.** 경로 API 는 Google Routes `computeRoutes` — **호출당 과금**이다(BFF `info_route.py`: 60초 Redis 캐시 + 사용자당 10회/분). 상한을 소진하면 유료 재탐색 대신 `Google 지도로 재안내` 배너로 유도한다. **탭 없이 외부 앱을 자동으로 열지 않는다**(구 3회 누적 자동전환 폐기).
- **이탈 판정**: 경로에서 50m 초과가 5초 이상 지속(`OFF_ROUTE_DISTANCE_M`/`OFF_ROUTE_SECONDS`). GPS 정확도 35m 초과 틱은 판정 스킵, 목적지 500m 이내는 나침반 모드로 판정 중단.
- **도착 = 종료 이벤트가 있어야 한다.** 목적지 `ARRIVAL_RADIUS_M = 40` 이내 진입 시 GPS watch 정지(배터리)·이탈 판정 해제·카메라 개요 복귀 + 도착 배너. **도착 판정은 나침반 모드보다 먼저 평가**한다(나침반 분기의 early return 에 막히면 도착이 영영 안 잡힌다).
- **회전은 course-up 자동 회전이다.** 방위 1순위는 **경로 스냅 세그먼트 방위**(`snapToPolyline`) — 경로는 고정값이라 GPS heading 처럼 떨지 않고 정지·신호대기에도 유효하다. GPS heading(`native.ts` 의 course-over-ground)은 **이탈 상태 + 1.5m/s 이상**에서만 폴백으로 쓴다. 진짜 나침반(DeviceOrientation)은 도입하지 않았다.
- **카메라 명령은 서로 취소된다** — MapLibre 카메라 애니메이션은 배타적이다. ① 경로 갱신 effect 의 개요 `fitBounds` 는 안내 중 건너뛴다(`guidingRef`), ② 시작 `flyTo` 가 끝날 때까지 `follow` 를 막는다(`introRef`, 리스너 등록은 `flyTo` **뒤**), ③ `follow` 는 center 와 bearing 을 **한 번의 `easeTo`** 로 준다. 셋 중 하나만 빠져도 회전·줌 연출이 조용히 사라진다.
- **[북쪽 맞춤] = course-up 해제, [내 위치] = 복귀**(`courseUpRef`). 해제 상태를 기억하지 않으면 다음 GPS 틱이 즉시 되돌려 북쪽 맞춤 버튼이 먹통이 된다. 별도 회전 토글 버튼은 두지 않는다.

---

## 시각 표기 (제정 2026-08-06)

- **절대시각은 항상 베트남 현지시각(ICT, `Asia/Ho_Chi_Minh`)으로 표기한다.** 공용 포맷터는 `frontend/src/lib/vnTime.ts`(`formatVnTime`/`formatVnDate`/`formatVnDateTime`). `toLocaleTimeString`/`toLocaleDateString` 을 `timeZone` 없이 직접 부르지 말 것 — **기기 타임존**이 쓰여 해외(예: 한국 +9)에서 보면 2시간 어긋난다.
- **백엔드도 표시용 시각 문자열은 ICT 로 내려보낸다.** OpenWeather 의 `dt_txt` 는 UTC 벽시계라 그대로 넘기면 화면에 UTC 가 찍힌다 — `dt`(unix)를 ICT 로 변환해 포맷한다(`info_weather.py` `ICT` 상수).
- 근거: 대표 지적 2026-08-06 — 날씨 화면에 "오후 03:50 기준"(KST)과 예보 "15:00"(UTC)이 함께 떠 한 화면에 두 기준이 섞였고 정작 ICT 는 없었다.

### 날씨 표시

- **condition → 아이콘/색 매핑은 `frontend/src/lib/weatherCondition.ts` 단일 소스**다. 화면마다 따로 그리지 말 것 — 홈 카드가 해 아이콘을 하드코딩하고 있어 부제는 "비 예보"인데 아이콘은 해인 모순이 났다(대표 지적 2026-08-06).
- 미등록 condition 코드는 **중립 구름**으로 폴백한다. 해로 폴백하면 같은 모순이 재발한다.
- **관측과 예보는 화면에서 분리한다.** "1시간 내 비 예상"은 예보이므로 현재 날씨 카드가 아니라 **예보 섹션**에 둔다 — 카드 안에 있으면 "지금 비인데 왜 85%?"처럼 모순으로 읽힌다(대표 지적 2026-08-06).
- **강수확률 공급자는 open-meteo 로 통일**(2026-08-06). 현재 관측만 OpenWeather `/weather` 를 쓰고, **24시간 예보·1시간 확률은 모두 open-meteo**(시간단위)다.
  - 종전에는 24h 예보만 OpenWeather `/forecast`(3시간 버킷)라 같은 화면에서 숫자가 어긋났다. 3시간 버킷은 호치민 우기의 국지 소나기도 놓친다(2026-08-03 "비 오는데 0%").
  - open-meteo 실패 시 **OpenWeather 3시간 예보로 폴백**한다 — 보조 소스 실패가 화면 실패로 번지지 않게.
  - WMO weather code → OpenWeather condition 어휘로 정규화한다(`_wmo_to_condition`). 프론트가 그 어휘로 아이콘·번역을 매핑하기 때문(`lib/weatherCondition.ts`).
  - ⚠️ **공급자 전면 교체는 근거 없이 하지 않는다** — 2026-08-06 구글 비교에서 OpenWeather 관측값(기온 31.1 vs 31, 습도 70 vs 72, 상태 비 vs 강우)은 이미 일치했다.

---

## 바텀시트 (지도 화면)

1. **시트는 사용자가 의도한 액션에만 자동 이동한다.** 지역 선택/해제, 모드 전환, 데이터 갱신 같은 "지도 탐색 중" 신호로 시트를 올리지 않는다 — 탐색 결과는 접힘 헤더(칩·건수·힌트 필)로 전달하고, 올릴지는 사용자가 결정한다.
2. 예외: **특정 아이템을 지목한 액션**(지도 핀 탭 = 이 매물 보기)은 시트를 올리되, 지도 컨텍스트(선택 핀)가 함께 보이도록 **mid까지만** 올린다. full 확장은 사용자 드래그로만.

(제정 2026-07-07 — "지역만 선택해도 시트가 자동으로 올라오는" UX 지적 반영)

---

## 찜 / 단골 역할 분리 (업체)

### 원칙

1. **찜(`user_favorite_business`) = 나중에 보려고 저장하는 개인 북마크.** 화면 `/map/favorites`(`pages/map/MapFavorites.tsx` 업체 탭). API `GET/POST/DELETE /biz/favorites`.
2. **단골(`business_follow`) = 그 가게의 소식을 받아보는 구독.** 화면 `/map/follows`(`pages/map/MapFollows.tsx`, 신규 2026-07-26). API `GET /biz/follow` + `POST/DELETE /biz/follow/{profile_id}`. 업체 대시보드(`BizDashboard.tsx`)의 "단골 N"은 이 구독자 수(`BusinessFollow` row 카운트)다.
3. **아직 없는 것**: 푸시/인앱 알림 연동은 미구현이다 — 단골을 맺어도 알림이 오지는 않고, `/map/follows` 화면에서 각 업체의 최신 소식을 모아 볼 수 있을 뿐이다(조회 시점에 `GET /biz/follow`가 `latest_news`를 함께 내려줄 뿐, 소식 등록 시점의 실시간 push는 없음).

### 왜 나눴는지 (2026-07-26)

2026-07-26 이전에는 두 기능이 실질적으로 동일했다 — 단골은 목록 조회 API 자체가 없었고(동네지도 프로필의 "단골 업체" 진입점이 "준비 중" 토스트만 띄웠다), 소식 알림·구독 연동도 전무했다. 대표가 "찜과 단골의 차이가 뭐냐, 결국 같은 즐겨찾기 아니냐"고 지적했고, 조사 결과 이 지적이 맞았다(기능 차이 없음 확인). 대응으로 **단골을 "소식 구독"으로 완성**해 역할을 분리했다 — 단골 전용 목록 화면(`/map/follows`)에 최신 소식 미리보기를 붙여, 찜(북마크)과 단골(소식 구독)이 서로 다른 사용자 의도를 표현하도록 만들었다. **이 이력을 남기는 이유**: 이후 세션이 같은 의문("왜 굳이 나눴나")으로 되돌아가지 않게 하기 위함 — 답은 "지금은 실질적 차이가 있다(소식 구독 여부)"이다.

---

## 광고 노출

1. **노출 순서 결정 SoT = 백엔드.** `backend/app/services/ad_exposure.py`(`build_exposure_sequence`)가 각 광고의 **weight = tier `exposure_weight` × `ad_fee`**(두 값 모두 최소 1로 clamp)로 **결정적 smooth weighted round-robin 시퀀스**를 만든다. `GET /market/ads`는 `AdsApplication.public_ads(상시 노출 광고)` → 이 시퀀스를 반환한다(`MAX_SEQUENCE_LENGTH=120` 캡).
2. **유료 tier 카탈로그 = `ad_tiers`** (`name`·`exposure_weight`·`monthly_price_vnd`·`display_order`). 광고주가 등록 시 tier를 **직접 선택**하고(`marketplace_ads.tier_id`, 가격은 `monthly_price_snapshot_vnd`로 스냅샷), tier의 `exposure_weight`가 노출 가중을 주도한다. 현재 카탈로그(`database/init/149_ads_tiers.sql`+`150_ad_tier_prices.sql`): **프리미엄(weight 3 · 499,000 VND/월) / 일반(weight 1 · 199,000 VND/월)**. `ad_fee`는 기본 0(→1 중립)이라 평시엔 tier가 노출을 지배하고, 필요 시 추가 가중 계수로만 작동한다.
3. **게시 라이프사이클 = 상시 게시 기본.** 등록(이미지+문구+tier 선택) → 심사(`review_status` PENDING→APPROVED) → **승인 즉시 상시 게시**(`starts_at` 미설정). `ends_at`은 **선택적**(이벤트성 광고의 자동 종료일)이며 미설정 시 무기한. 노출 게이트(`launching_ad_conditions`) = `APPROVED + is_active + 기간유효`(starts/ends NULL이면 상시). 광고주는 `BizManage`에서 `stop`/`resume`로 중단/재개한다. (구: start~end 범위 필수 입력 → 폐기, 월 구독형이라 상시가 기본)
4. **프론트는 서버 순서를 소비만 한다.** `frontend/src/lib/adPlacement.ts`(공용, `AD_EVERY=6`)는 서버가 반환한 순서를 화면별 위치 기준으로 순환 배치할 뿐, **재가중·재정렬·shuffle을 하지 않는다.** MarketMain·NeighborhoodMap(Canvas)·HomePage 3개 화면이 이 모듈을 공유한다.
5. **과금**: `monthly_price_vnd`는 구독 표시가일 뿐 **자동 결제 엔진은 미구현** → 초기엔 오프라인 정산(관리자 입금 확인 후 게시) 전제. tier/ad_fee/price는 공개 응답(`MarketplaceAdOut`)에 미노출.

(제정 2026-07-23 · 개정 2026-07-25 — 유료 tier 도메인(`ad_tiers`) + 월정액(일반 199k/프리미엄 499k) + 상시 게시(선택 종료일) 모델로 정리. 노출 weight = tier `exposure_weight` × `ad_fee`.)
