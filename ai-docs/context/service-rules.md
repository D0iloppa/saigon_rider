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
13. **위치 획득은 권한 확인 결과로 차단하지 않는다** (2026-08-06 실기기 결함 수정). `requestDeviceLocation()`(`native.ensureLocationPermission()` 후 `native.getLocation()`)은 권한을 **요청하되 결과로 진행을 막지 않는다** — 항상 `getLocation()` 까지 간다. 권한을 보는 커스텀 `Gps` 플러그인(`native/ios/Podfile`, `native/android/capacitor.settings.gradle`)과 실제 측위 경로(`@capacitor/geolocation` 배제 → WebView `navigator.geolocation` 폴백)가 **다르므로**, 커스텀 플러그인의 답과 실제 측위 가능 여부가 어긋날 수 있다. **실제 사고(abb2ded)**: `RideNav`만 이 게이트를 둘러서 동네지도는 정상이었는데 경로찾기만 실기기에서 실패 — dev 오버라이드가 `checkLocationPermission()` 을 무조건 `'granted'` 로 갈아끼워 하네스에선 재현되지 않았다. **실제 권한 거부는 측위 실패(`code===1`)로 드러난다** — `classifyLocationError` 가 `permission` 분류로 안내 문구를 띄우므로(fdb5f69) 게이트 제거 후에도 권한 안내는 유지된다. 계약 테스트 `frontend/src/pages/ride/resolveOriginParity.contract.test.mjs` 이 회귀를 방지한다.
14. **일회성 측위와 지속 추적은 같은 판정을 공유해야 한다** (2026-08-07 정정 — 실패 유발 대신 등록 여부 조회). `getLocation()`·`watchLocation()` **둘 다** `Capacitor.isPluginAvailable('Geolocation')` (동기, `@capacitor/core` `CapacitorGlobal.isPluginAvailable`)로 `@capacitor/geolocation` 플러그인이 현재 플랫폼에 등록됐는지 **미리** 판정해 분기한다 — 호출해보고 실패(또는 침묵)한 뒤 잡는 구조가 아니다. Android·iOS 는 이 플러그인을 vendoring 하지 않으므로(`native/ios/Podfile`, `native/android` 쪽 설정 — `GpsPlugin` 이 CoreLocation/LocationForegroundService 를 직접 씀) native 에서는 항상 `false` 가 나와 **처음부터** `navigator.geolocation` 을 쓴다 — 즉 지금은 이게 폴백이 아니라 **실질 본 구현**이다. 웹에서는 `@capacitor/geolocation` 이 자체 web 구현(`navigator.geolocation` 을 내부적으로 감쌈)을 등록하므로 `true` — 웹 경로는 기존과 동일하게 Capacitor 를 그대로 쓴다. 플러그인 배제가 풀리면(Podfile/gradle 복원) 이 판정이 **자동으로** Capacitor 경로를 다시 고른다. 예전의 `FALLBACK_TIMEOUT_MS=7초` 침묵-실패 타임아웃(호출 후 응답 대기)은 **제거됐다** — 등록 여부를 미리 알기 때문에 "호출 → 응답 없음 → 전환" 구조 자체가 필요 없어졌고, 안내 시작 직후 최대 7초간 추적이 멈춘 것처럼 보이던 결함도 함께 사라졌다. 다만 이는 "플러그인이 미등록이면 절대 호출하지 않는다"는 전제 위에서만 안전하다 — 만약 플러그인이 등록됐다고 보고된 뒤에 새로운 이유로 침묵 실패하는 경우가 생기면 그건 별도 결함으로 다뤄야 한다(현재는 그런 경로가 존재하지 않아 선제 대응하지 않았다). **워처는 여전히 1개**여야 한다(원칙 7) — 두 경로 중 하나만 선택되고 동시에 시작되지 않는다.

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

### 회전(나침반) — `enableFollowCompass` (제정 2026-08-06, 개정 2026-08-06 — 추종/나침반 직교 2축, 개정 2026-08-07(1차) — 회전축 3-state + 수동 제스처, 개정 2026-08-07(2차, 대표 지시, 네이버지도 참조) — ◎ 3단 순환 + 나침반은 회전 시에만 노출, [`260806_svg_map_v6_rotation_design.md`](../260806_svg_map_v6_rotation_design.md))

- **`SaigonMapV5` 는 `enableFollowCompass` prop 이 있어야만 카메라 추종·회전(수동 포함)이 켜진다.** 미전달 8개 소비처(위치 피커·정보 지도 등)는 기존 동작과 완전히 동일하다(킬스위치 — 수동 두 손가락 회전 제스처도 이 플래그 안에서만 동작한다). 배선된 곳은 **동네지도(`NeighborhoodMapCanvas`)·마켓지도(`MarketMain`)뿐**이다.
- **네이버지도 모델(2026-08-07 2차 개정)** — 사용자 피드백("수동 회전 제스처와 핀치줌이 묶여 회전모드가 어색하다", "네이버지도처럼 평상시엔 나침반 버튼이 없고 회전한 경우에만 생겨야 한다")에 따라, heading 추종의 시작·해제를 ◎ 버튼으로 옮기고 나침반 버튼은 "회전 시에만 나타나는 북향 복귀 전용" 버튼으로 축소했다.
  - **◎ 버튼(항상 표시)** 이 이제 **자유 → 카메라추종 → heading추종 → 자유** 3단을 순환한다(`recenterCurrentContext`). 자유→카메라추종은 기존과 동일하게 `runLocate` 실측 후 `isFollowing=true`. 카메라추종→heading추종은 `compassMode`를 `'follow'`로만 바꾼다(재측위 없음). heading추종→자유는 `isFollowing=false`와 `compassMode='north'`를 함께 되돌린다.
  - **나침반 버튼은 `bearing !== 0`일 때만 렌더된다** — 평상시(정방향)엔 요소 트리에 아예 없다. 누르면 `compassMode`를 무조건 `'north'`로 리셋할 뿐, `isFollowing`(◎ 의 카메라추종 여부)은 건드리지 않는다 — 즉 heading추종 중 나침반을 누르면 북향으로 복귀하면서 heading추종만 해제되고 카메라추종 단계로 내려간다(다시 ◎ 를 누르면 heading추종으로 재진입).
  - **버튼 시각(개정 2026-08-07 3차, W15 — 대표가 실기기 스크린샷으로 지적: 나침반 버튼과 ◎ heading 상태가 둘 다 `Navigation rotate(-bearing)` + 주황 활성이라 "같은 버튼 두 개"로 보여 버그처럼 읽혔다)**:
    - **나침반(북향복귀)** — 커스텀 인라인 SVG `CompassRoseIcon`(20px): 상단이 끊긴 원형 링 + 그 자리에 얹은 스트로크 `N` + **빨간 북침 / 회색 남침**. lucide 에는 `N` 표기 나침반이 없다(`Compass` 는 대각선 바늘뿐). 껍데기는 **기본 `.ctrlBtn`**(흰 배경) — 활성 주황을 쓰면 ◎ 활성과 같은 알약이 되고 빨간 북침 대비도 죽는다. 이 버튼의 정보값은 "북쪽이 어디인가"이므로 **회전(`rotate(-bearing)`)은 유지**한다.
    - **◎ 3상태는 회전이 아니라 형태로 구분한다(회전 금지)** — 자유 `Locate`(중심 빈 원)+기본, 카메라추종 `LocateFixed`(중심 점 채움)+활성, heading추종 커스텀 `HeadingConeIcon`(점+시야각 부채꼴)+활성. 앞 두 단계가 색만으로 갈리지 않도록 `Locate`/`LocateFixed` 의 중심 점 유무를 비색상 단서로 함께 쓴다.
- **회전축 자체는 여전히 3-state 상태기계다(2026-08-07 1차 개정 유지).** `bearing` 이 세 소스를 합류시킨 단일 변수다: `'north'`(0, 정방향) / `'manual'`(두 손가락 회전 제스처가 갱신하는 `manualBearing`) / `'follow'`(GPS heading 을 따르는 `compassBearing`, 이제 ◎ 3단째에서만 진입). 하나의 변수로 합류하기 때문에 탭 히트테스트·컬링·라벨/마커 위치회전·회전 `<g>` 등 기존 6개 소비 지점은 **손대지 않아도 자동으로** 세 모드 모두를 반영한다.
  - **수동 두 손가락 회전 제스처**는 어느 상태에서든 `'manual'` 로 전이시킨다 — heading 추종 중에 사용자가 손으로 돌리면 그 즉시 `compassMode` 가 `'follow'` 를 벗어나 추종이 해제되고, 그 순간부터 수동각을 따른다(◎ 의 카메라추종 자체는 유지).
- **수동 두 손가락 회전은 핀치줌과 같은 두 포인터 제스처 안에서 각도만 별도로 추적한다** — 거리(줌)와 각도(회전)를 배타로 만들지 않고 동시에 적용한다(일반 지도의 핀치+회전 관례). 다만 대표 피드백("줌만 하려는데 손가락이 틀어지면 회전이 걸림")에 따라 회전 판정을 두 겹으로 강화했다(2026-08-07 2차):
  - **회전 시작 데드존 = 누적 각도 6°**(`MANUAL_ROTATE_START_DEG`, 이력: 6→10(2026-08-07 오전, "회전모드가 어색해")→6(2026-08-07 오후, "인식이 잘 안 된다")) — 되돌린 게 아니라, 핀치 오작동 방어를 아래 지배성 판정으로 옮겨 각도 데드존은 응답성 전담으로 되돌렸다.
  - **지배성 판정**(`ROTATE_DOMINANCE_RATIO = 2.0`, 2026-08-07 오후 1.2→2.0 강화) — 회전이 만든 호 길이(반지름×누적각도 라디안, px)가 줌이 만든 누적 거리변화(px)의 2배를 넘어야만 각도 데드존과 별개로 회전으로 커밋한다. 순수 회전 제스처는 거리변화(distAcc)가 거의 0이라 이 배수를 올려도 반응이 늦어지지 않고, 순수 줌 제스처는 거리변화가 지배적이라 데드존을 넘어도 커밋되지 않는다 — 두 요구(응답성↑/오작동↓)를 서로 다른 상수에 분리했다.
  - 판정(`g.rotating`)은 한 번 커밋되면 **그 두 손가락 제스처가 끝날 때까지 고정**된다(매 프레임 재판정 아님) — 회전으로 커밋된 뒤 손이 다시 줌 위주로 움직여도 회전이 끊기지 않아 안정적이다.
  - 데드존은 **회전 시작에만** 적용하고, 일단 회전이 시작되면 매 프레임 그대로 반영한다(진행 중 회전에 추가 데드존을 걸면 heading 데드존과 같은 이유로 반응이 끊겨 보인다). 회전 중심은 기존 `getCamCenter()`(추종/나침반과 동일)를 그대로 쓴다.
  - 줌과 회전은 완전히 배타는 아니다 — 지배성 판정을 통과하면 동시 조작(핀치+회전)도 가능하다. 이번 강화의 목적은 "의도치 않은 회전이 안 걸리는 것"이지 동시 제스처 자체를 막는 것이 아니다.
- **데스크톱 마우스 전용 회전 수단은 만들지 않았다.** 이 앱은 Capacitor WebView 기반 모바일 앱이 타깃이라 휠/드래그에 별도 modifier-key 회전 단축키를 추가하지 않았다 — 필요해지면 별도 검토 대상.
- **팬·핀치(줌)·휠 제스처는 추종만 끈다 — 손으로 만든 회전(`compassMode==='manual'`)이나 정방향(`'north'`)은 그대로 둔다.** 회전은 각도이고 팬/줌은 중심·범위라 서로 충돌하지 않으며, 사용자가 명시적으로 켠 회전을 제스처가 몰래 꺼버리면 동작이 예측 불가해지기 때문이다. **단, heading 추종(`compassMode==='follow'`) 중 제스처로 이탈할 때는 heading 추종도 함께 해제하고, 그 순간의 각도만 `'manual'`(`manualBearing`)로 이어받는다**(2026-08-07 3차, `exitFollowByGesture` 헬퍼, 네이버지도 SDK `LocationTrackingMode` 참조) — 손으로 만든 회전은 센서가 아니라 사용자 의도라 안 끄지만, 센서(자력계/GPS heading) 추종은 팬/줌으로 이탈한 뒤에도 계속 도는 게 "다음 ◎ 클릭 시 1단계부터"라는 상태기계 계약을 깨서 함께 끈다 — 이 둘이 다른 이유로 공존한다.
- **제스처 좌표 보정(개정 2026-08-06, 실측 수정)**: 회전은 SVG 내부 `<g>` **하나만** 돌리고 루트 `<svg>`/`viewBox` 는 절대 돌지 않는다 — 따라서 화면→viewBox 매핑은 bearing 과 무관하게 항상 선형(linear)이다. **팬·휠·핀치중심 3곳은 이 매핑 결과(userSpace 좌표)를 그대로 쓴다 — +bearing 보정을 걸면 안 된다.** 구현 초기(`08cd1e3`)에 4곳 전부에 일률로 +bearing 보정을 넣었던 것이 결함이었다(실측: bearing=90°에서 수평 드래그가 viewBox 를 수직으로만 움직였다). **탭 1곳만 예외** — ward 폴리곤 히트테스트가 map(unified) 좌표계와 비교하므로, userSpace 지점을 map 좌표로 되돌리는 +bearing 역회전(`rotatePoint`)이 반드시 필요하다. 재발 방지: "제스처 4곳에 일률 보정"이라는 가정을 다시 세우지 말 것 — 각 좌표가 최종적으로 어느 좌표계(userSpace vs map-space)로 쓰이는지가 다르다.
- **서비스 지역 밖: 회전(나침반)은 허용하되 추종·"내 위치" 점은 허용하지 않는다.** heading/speed 는 기기 값이라 위치 의미론과 무관하므로 지역 밖에서도 계속 반영되지만, 좌표 자체(`meLatLng`)는 지역 밖이면 갱신하지 않는다 — 가짜 위치점을 찍지 않는다는 기존 폴백 불변식(§폴백 정책)을 그대로 지킨다. **회전 중심은 마지막으로 확정된 지역-안 좌표가 아니라, 지역 밖으로 나간 순간부터 화면(viewBox) 중심으로 전환된다** — 안 그러면 낡은 좌표를 축으로 지도가 도는 결함이 난다.
- **나침반 모드(회전 중)에서도 L3(건물)·POI 는 그대로 표시한다(2026-08-06 대표 지시로 정정 — 구 결정 "회전 중 L3 비활성"은 폐기).** 회전 시 화면을 덮으려면 뷰포트가 오버스캔(√2, 45°에서 면적 2배)돼야 해 피처가 그만큼 늘지만, 컬링(`rotatedBBoxOfRect`)이 그 방어를 맡는다. **저사양 기기에서 문제가 되면 L3 를 다시 끄는 대신 오버스캔 여유(컬링 마진)를 줄이는 쪽을 먼저 검토한다.**
- **콘텐츠 조회(query) bbox 도 회전 중엔 확장한다.** `onBboxChange`(POI·업체 등 콘텐츠 조회용)는 회전된 화면 모서리를 덮도록 `rotatedBBoxOfRect` 로 확장된 사각형을 emit 한다 — 안 그러면 회전된 모서리에 들어온 콘텐츠가 백엔드 조회에서 누락된다(POI 미표시 원인이었다). **`onRawViewportChange`(뷰포트 복원·크로스헤어, "raw 중심 = 실제 컨테이너 중심" 불변식)는 확장하지 않는다** — camera-center 기준으로 넓히면 그 중심이 컨테이너 중심에서 벗어나 불변식이 깨진다. `bearing===0` 이면 두 emit 모두 기존과 바이트 단위로 동일하다.
- **heading 소스는 자력계/나침반 우선, GPS course-over-ground 폴백**이다(2026-08-07 대표 지시로 도입 — "모바일 헤딩은 GPS 좌표와 무관해야 한다"). `native.watchCompassHeading()`이 값을 내는 동안은 그쪽을 쓰고, 값이 한 번도 오지 않으면 기존 GPS course 경로로 자동 폴백한다(`compassAvailableRef`). **iOS 는 CLLocationManager 네이티브 헤딩**(`GpsPlugin.startHeading`/`stopHeading`, W14 2026-08-07 개정) — WKWebView 의 `DeviceOrientationEvent` 가 WKUIDelegate 자동승인(`decisionHandler(.grant)`)에도 실기기에서 이벤트 자체를 안정적으로 전달하지 못하는 신뢰성 문제가 있어 대체했다(위치 권한만 재사용, Motion 권한 불필요). **Android/웹은 여전히 웹 API**(`deviceorientationabsolute`→`deviceorientation` 폴백, iOS 비네이티브 경로엔 `webkitCompassHeading` 도 남아 있음). 두 소스 모두 데드존 8°(`COMPASS_DEADZONE_DEG`)를 적용해 마지막 유효 방위를 유지하며, GPS 경로는 추가로 `speed < 1.5 m/s` 이거나 `heading`/`speed` 가 `null` 이면 갱신하지 않는다(자력계/나침반 경로는 위치·속도와 무관해 이 게이트가 없다 — 정지 상태에서도 회전한다). 권한 요청(`requestCompassPermission()`)은 ◎ 버튼의 카메라추종→heading추종 전이(사용자 탭) 안에서 시작한다(W14 — 연속 탭은 요청 토큰으로 stale-write 방어).
- **자력계 구독 범위: `meDotActive || compassMode==='follow'`**(개정 2026-08-07, W15 대표 결정 → W16 회귀 수정으로 OR 확장). W15 는 게이트를 `compassMode==='follow'` 에서 `meDotActive` 로 **완전 대체**했는데, 이러면 서비스 권역 밖(`meLatLng===null`)에서는 `meDotActive` 가 항상 false 라 heading추종에 들어가도 구독이 전혀 안 걸려 지도가 안 도는 회귀가 났다(대표가 한국 실기기로 재현 — 자력계 도입 목적 자체가 "GPS·위치와 무관해야 한국에서도 회전 검증 가능"이었는데 정면으로 깨뜨렸다). **불변식: 서비스 권역 밖에서도 heading추종(`compassMode==='follow'`) 중이면 자력계는 계속 구독된다** — `meDotActive` 는 heading 삼각형 표시용, `compassMode==='follow'` 는 회전용으로 서로 다른 목적이라 OR 로 넓혀야 둘 다 성립한다. 점을 안 쓰고 나침반도 안 쓰는 화면(위치 피커 등)은 둘 다 false 라 여전히 센서를 켜지 않는다 — 게이트가 없어진 게 아니라 넓어진 것이고, 두 조건 중 하나의 전이로도 재구독되며 그때마다 언마운트/해제가 일어난다. **킬스위치와 충돌하지 않는다**: `enableFollowCompass=false` 면 `compassMode` 가 `'north'` 를 벗어날 수 없어(`compassMode==='follow'` 항이 항상 거짓) `bearing` 합류식도 `compassBearing` 을 읽지 않으므로, 상시 갱신되더라도 회전은 일어나지 않는다(삼각형 방향만 바뀐다). `compassAvailableRef`(GPS course 폴백 스위치) 리셋 지점은 여전히 "새 구독이 시작될 때마다"다 — 이 플래그의 의미는 "이 구독이 값을 낸 적 있는가"이므로 구독이 재생성되면(예: 권역 밖에서 follow 진입/해제를 반복) 매번 리셋되는 게 맞다(실제로 새 리스너가 붙기 때문).
- **"내 위치" 점은 heading 삼각형을 상시 표시한다**(2026-08-07, W15, 네이버지도 레퍼런스). 링(r×2) **바깥**에 삼각형을 붙이고 각도는 **`heading − bearing`** 이다 — `'north'`(bearing=0)면 heading 그대로, `'manual'` 이면 손으로 돌린 각만큼 되돌려 보정, `'follow'` 면 `bearing===heading` 이라 항상 화면 위를 가리킨다(레퍼런스와 동일 거동). **heading 첫 값을 받기 전에는 렌더하지 않는다** — 기본값 0 을 그리면 모르는 방향을 북이라고 우기는 것이고 첫 값에서 툭 튄다.
- **회전 계층은 SVG 내부 `<g transform="rotate(...)">` 하나뿐이다.** 루트 `<svg>` 에 CSS `transform` 을 걸지 말 것 — `getBoundingClientRect()` 가 부풀어(각도에 따라 최대 √2배) 팬·탭·휠 제스처가 조용히 틀어진다.
- **`preserveAspectRatio="none"` 이라 `vb.h = vb.w × 컨테이너비율` 불변식이 깨지면 회전이 전단(shear)으로 보인다.** 나침반 진입·컨테이너 리사이즈(`ResizeObserver`) 시 이 비율을 재계산해 유지한다.
- **이 두 화면(동네지도·마켓지도) 외 6곳에는 회전·추종을 켜지 않는다** — 위치 피커(`BizLocationPicker`·`LocationPickerSheet`)·정보 지도(`InfoFloodMap`·`InfoGasList`·`InfoRepairList`)·`BizPublic`. 탐색 목적이 아니거나 특정 위치 선택이 목적인 화면에서는 추종/회전이 방해가 된다.

### 마일리지 거리 계상 (제정 2026-08-06, Engine `mileage.py::_apply_event_time_policy`)

- **GPS 거리 계상은 공백 5분 초과 구간을 버린다** — 포그라운드 전용 워처이므로 공백 구간의 이동 경로를 알 수 없고, 속도 게이트만으로는 공백 길이에 비례해 뚫린다.
- **단일 이벤트 거리에는 절대 상한이 있다**(`MAX_EVENT_DISTANCE_M`, `previous_at` 유무와 무관하게 적용) — 첫 이벤트는 속도 검사 대상이 아니므로 상한이 없으면 그 경로가 무제한으로 남는다.
- `total_distance_m` 은 표시용 숫자가 아니라 마일리지 정책의 반복 달성 조건이다 — RP 적립→쿠폰·기프티콘 환금으로 이어지는 머니 경로이므로 거리 게이트 결함은 표시 버그가 아니라 지급 결함으로 취급한다.

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

## 마켓 매물 노출 정책 (제정 2026-08-07, 대표 지시)

**불변식 — 새 매물 조회 쿼리를 추가할 때마다 확인할 것.**

`MarketplaceListing.status` 는 DB enum 제약이 없는 자유 문자열(`String(20)`)이라 **쿼리마다 필터를 직접 걸어야 한다.** 한 곳만 빠뜨려도 그 화면에서만 정책이 깨진다(실제 사례: 홈 "내 주변 인기 상품"이 `hide_sold` 미전달로 SOLD 를 노출하고 있었고, `market.py:478` "판매자 다른 매물"은 아직 SOLD 를 걸지 않는다 — 별건).

| status | 공개 노출 | 비고 |
|---|---|---|
| `ON_SALE` | ✔ | |
| `RESERVED` | ✔ | 예약중은 계속 노출한다 — 숨기는 것은 거래완료뿐이다 |
| `SOLD` (거래완료) | ✘ | **판매자 본인이 자기 매물을 조회할 때만 예외** (`seller_id == session_uid`) — 자기 판매 이력이 사라지면 안 된다 |
| `WITHDRAWN` (철회) | ✘ | 항상 비노출 (기존 정책) |
| `HIDDEN` / `REMOVED` | ✘ | 모더레이션, 항상 비노출 |

- `SOLD` 전이는 `market.py::complete_appointment` 한 곳에서만 일어나고 **종결 상태**다(SOLD → 다른 상태 전이 전부 거부).
- **리스트·지도·검색·"내 매물"이 모두 `GET /market/listings` 하나를 공유한다** — 지도용 별도 쿼리가 없어 필터 한 번으로 양쪽에 적용된다. 새 화면을 만들 때 별도 엔드포인트를 파면 이 이점이 사라지므로, 가능하면 이 엔드포인트를 재사용할 것.
- **총계 쿼리(`count_q`)에도 같은 필터를 걸어야 한다** — 안 걸면 페이지네이션 총계가 실제 목록보다 많아진다.
- 프론트의 `hide_sold` 쿼리 파라미터는 **옛 사용자 토글의 잔재**다. 하위호환으로 시그니처만 남아 있고 로직에서는 무시한다 — 이 값으로 SOLD 노출을 되살릴 수 없다.

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
