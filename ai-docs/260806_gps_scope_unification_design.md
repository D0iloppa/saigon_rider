# GPS 기준 위치 컨텍스트 통일 — 설계도 (2026-08-06)

> **상태**: **확정** (2026-08-06 검토 완료 — §10 A~D 전부 확정, 구현 착수)
> **발단**: 대표 지시 2026-08-06 08:45~08:50 카톡 — "기본을 다 GPS로 / 안잡히면 전체지역으로 / 2개로만해 / 모든화면에서 / 지도 다나오게"
> **선행 백업 커밋**: `9fd13af`

---

## 1. 문제 — 왜 화면마다 지역이 다른가

대표님이 캡처로 지적한 것은 UI 버그가 아니라 **위치 컨텍스트의 SoT가 3벌로 갈라져 있다**는 구조 문제다.

| # | 화면 | 현재 위치 기준(SoT) | 코드 |
|---|---|---|---|
| A | 홈 `WorldMapV2` | **저장된 지역 or `BEN_THANH_FALLBACK`** — GPS는 헤더 표시 전용 | `pages/home/WorldMapV2.tsx:225-241` |
| B | 마켓 `MarketMain` | **독자 localStorage** (`mkt_filter_v2`, `locationMode: 'all'\|'gps'\|'region'`) | `pages/market/MarketMain.tsx:48-62,118` |
| C | 동네지도 `NeighborhoodMap` | `useLocationStore` (`mode: 'all'\|'region'`) | `pages/map/NeighborhoodMap.tsx:85-98` |
| D | 정보 4화면 (주유·정비·침수·날씨) | `useLocationStore` → 없으면 `HCMC_DEFAULT_CENTER` | `hooks/useServiceLocation.ts:13-21` |

### 캡처별 진단

- **사진1 (홈)** — 헤더는 `Thạnh Mỹ Tây`(GPS), 상품 배지는 `Bến Thành`. `WorldMapV2.tsx:235` 주석이 원인을 그대로 명시한다: *"주의: 표시 전용이다. 목록 조회 기준 좌표(coords/resolvedWard)는 건드리지 않는다."* → 헤더와 목록이 다른 좌표를 본다.
  - ※ `1075.27 km`는 거리 버그가 아니라 **누적 주행거리(오도미터, `WorldMapV2.tsx:168,392`)**다. 앞선 분석에서 거리 이상값으로 봤던 것을 정정한다.
- **사진2 (마켓 지도)** — 내 GPS 점은 `Thạnh Mỹ Tây`인데 하이라이트 폴리곤·헤더·지역칩은 `Bến Thành`. 저장된 `locationMode:'region'` 상태가 GPS보다 우선하기 때문.
- **사진3 (표시범위 시트)** — 3옵션(`전체 / 내 현재 위치 / 지역 선택`). 대표 지시로 2옵션으로 축소.
- **"주유소. 강수. 등. 지역이 뭔기준이냐"** — D는 GPS를 아예 쓰지 않는다(`useServiceLocation`은 `useSelectedRegion`만 본다). 대표님이 GPS 켜고 봐도 화면은 예전에 고른 지역 기준.

**근본 원인 한 줄**: GPS는 "장식"이고 실제 기준은 "사용자가 과거에 고른 지역"이었다. 대표 지시는 이 우선순위를 **뒤집는 것**이다.

---

## 2. ⚠️ 기존 도메인 불변식과의 정면 충돌 (결정 필요)

`ai-docs/context/service-rules.md` GPS 원칙 1·2는 이번 지시와 **정반대**다.

> 1. **GPS는 강제하지 않는다.** 앱 진입·화면 이동 시 GPS를 자동 측정하지 않는다.
> 2. **지도 탐색에는 GPS를 쓰지 않는다 (개정 2026-07-25).** ... 위치 컨텍스트는 전체(all) ↔ 사용자가 고른 지역(region) 2모드뿐이다.

이 규칙은 예외 4(홈 헤더 표시전용)·예외 5(지도 파란 점 표시전용)로 이미 두 번 뚫려 있었고, 이번 지시는 **예외가 아니라 원칙 자체의 교체**다.

**본 설계는 원칙 1·2를 폐기하고 GPS-우선으로 개정하는 것을 전제로 한다.** 이에 따르는 실제 비용:

- 앱/화면 진입마다 위치 권한 프롬프트가 뜬다 → **첫 진입 이탈률에 직접 영향**. 완화책은 §5.
- `260803_prelaunch_ux_audit.md` P1 항목 *"지도 진입 GPS 자동요청"*이 감사 지적으로 올라와 있다 → 이번 개정으로 **의도된 동작으로 승격**되므로 감사 문서에서 해당 항목을 닫아야 한다.
- 스토어 심사(iOS): 진입 즉시 위치 요청은 거부 사유가 될 수 있어 **목적 문자열(`NSLocationWhenInUseUsageDescription`) 정비 필요**.

> **확인 요청 A** — 이 3가지 비용을 감수하고 원칙 1·2를 폐기하는 게 맞는지 확정 필요.

---

## 3. 목표 상태 (확정된 결정)

| # | 결정 | 근거 |
|---|---|---|
| D1 | 위치 모드는 **`'gps' | 'all'` 2개**. `'region'` 및 지역 수동 선택 경로 **완전 제거** | 대표 "2개로만해" + 사용자 확정 |
| D2 | **기본값 `'gps'`**. 진입 시 측위 → 서비스권역 내면 `'gps'` | 대표 "기본을 다 gps로" |
| D3 | 측위 실패/거부/타임아웃/권역밖 → **`'all'` 폴백 + 1회 토스트** | 대표 "안잡히면 전체지역" + 사용자 확정 |
| D4 | `'gps'` 모드의 "근처" = **내 좌표 반경 3km** (행정구역 무관), 거리순 정렬 | 사용자 확정 — 구경계 걸친 매물 누락 방지 |
| D5 | **지역 선택 강조/마스킹 제거**(`polyActive=false`), 초기 카메라를 **GPS 중심**으로 | 대표 "지도 다나오게" + 사용자 확정 |
| D6 | **좌하단 지역칩(`AreaPill`) 제거** | 사용자 확정 |
| D7 | **L2 줌 게이트는 유지** (`zoomGateShort` 필 포함) | 사용자 확정 — "멀리서 볼 때 확대를 유도하는 버튼이므로 맞다" |
| D8 | 적용 범위 = **마켓 / 동네지도 / 홈 근처상품 / 주유소 / 날씨** | 대표 "모든화면에서" |

> **⚠️ D5 의 범위 — 동 경계선은 지우지 않는다** (2026-08-06 확인)
>
> "지도 다나오게"는 **지역 선택 기능**을 없애라는 뜻이지, 지도의 행정구역 경계 자체를 지우라는 뜻이 아니다. 실제로 `SaigonMapV5.tsx:16` 이 구조를 명시한다: `Layer 1 (항상): 동 경계선 + 수로 [depth1.json]`.
>
> | 유지 (건드리지 않음) | 제거 (`polyActive=false`) |
> |---|---|
> | Layer 1 동 경계선 폴리곤 (L1227, `polyActive` 무관하게 항상 렌더) | 선택 동 **주황 테두리** 오버레이 (L1276) |
> | 동 이름 라벨 (`Bình Thạnh`, `Gia Định` …) | 선택 동 외 나머지 동 **감쇠**(`.wardDim`, L1237-1245) |
> | 수로·도시 윤곽 | 선택 동 외 **L2 블록·L3 건물 레이어 숨김** (L1131, L1258) |
>
> 종전에는 `Bến Thành` 이 선택돼 있어 나머지 동이 감쇠되고 상세 레이어가 잘려 있었다 — `polyActive=false` 는 그 **잘림을 푸는 것**이지 경계선을 지우는 게 아니다.

### 목표 화면 상태

```
Phạm vi hiển thị (표시 범위)
  ● Dùng vị trí hiện tại   ← 기본값
  ○ Toàn bộ khu vực

지역칩(좌하단 Bến Thành ✕)   : 없음
지역 선택(지도 탭 → 필터)      : 없음
폴리곤 주황 경계 / 외부 마스크  : 없음
L2 줌 게이트 + 확대 안내 필     : 유지
```

---

## 4. 설계 — 단일 SoT `useLocationStore` 재정의

지금 3벌인 SoT를 **한 벌**로 합친다. 새 스토어를 만들지 않고 **기존 `store/useLocationStore.ts`를 축소·재정의**한다(신규 추상화 금지, 카파시 #2).

### 4.1 스토어 계약

```ts
// store/useLocationStore.ts (재정의)
type LocationMode = 'gps' | 'all';

interface LocationState {
  mode: LocationMode;                              // persist (localStorage)
  coords: { lat: number; lng: number } | null;     // persist 안 함 — 매 세션 재측위
  wardName: string | null;                         // 표시 라벨 전용
  /** 'fallback' = 서비스 권역 밖이라 중심가 좌표로 대체됨 — 화면이 라벨을 정직하게 쓰도록 */
  coordsSource: 'device' | 'fallback' | null;      // persist 안 함
  resolving: boolean;
  /** 측위 시도 → 성공 mode='gps' / 권역밖 mode='gps'+fallback좌표 / 실패 mode='all'. 토스트 1회 */
  ensureLocation(): Promise<void>;
  setMode(m: LocationMode): void;                  // 시트 2옵션이 호출
}
```

**핵심 규칙**
- `region: SelectedRegion | null` 필드와 `selectRegion()` **제거**.
- `coords`는 **persist하지 않는다** — 어제 좌표로 오늘 "근처"를 계산하면 사진2와 같은 불일치가 재발한다. 모드만 기억하고 좌표는 매 세션 새로 잡는다.
- `wardName`은 **라벨 전용**. 필터 판정에 절대 쓰지 않는다(D4 — 판정은 좌표 반경).

### 4.2 측위 1회 규칙

```
앱 세션당 ensureLocation() 실측은 1회.
  → 이미 coords 보유 & mode==='gps' 면 캐시 반환 (화면 이동마다 재측위 금지)
  → 화면 A가 진입 중 호출하고 화면 B가 곧이어 호출하면 같은 Promise 공유 (in-flight dedupe)
```

`native.watchLocation`(예외 5, 파란 점 실시간 추종)은 **현행 유지** — 점 표시 전용이고 필터를 건드리지 않는다.

### 4.3 폴백 정책

**"측위 실패"와 "권역 밖"은 다른 사건이다.** 전자는 *어디 있는지 모름* → 전체 지역밖에 줄 게 없다. 후자는 *어디 있는지 알고, 서비스 범위 밖임* → 기존대로 **알리고 중심가로 안내**한다. (대표 확인 2026-08-06: "권역밖은 기존에는 HCMC를 벗어났다고 토스트 주고 대표지역 폴백이었다")

| 상황 | 결과 mode | `coordsSource` | 기준 좌표 | 토스트 |
|---|---|---|---|---|
| 측위 성공 & `inServiceArea` | `gps` | `device` | 실측 좌표 | 없음 |
| **성공했으나 서비스 권역 밖** | **`gps`** | **`fallback`** | **`BEN_THANH_FALLBACK`** | `map.outsideArea` |
| 권한 거부 (code 1) | `all` | — | 없음 | `map.listFirst.nearMeDenied` |
| 타임아웃 (code 3) | `all` | — | 없음 | `map.listFirst.nearMeTimeout` |
| 측정 불가 / 위치서비스 꺼짐 | `all` | — | 없음 | `map.listFirst.nearMeUnavailable` |

- 토스트는 **세션당 1회**. 화면 5개가 각자 띄우면 폭탄이 된다 → 스토어가 발화 여부 플래그를 들고 있는다.
- 권역밖도 `mode:'gps'`이므로 **반경 3km 필터가 그대로 적용**된다 — Bến Thành 중심 3km. 목록이 비지 않는다.
- **`coordsSource: 'device' | 'fallback'`을 스토어가 노출한다.** 화면은 이 값으로 라벨을 정직하게 쓴다(권역밖인데 "내 현재 위치"라고 쓰면 안 된다). `260803_prelaunch_ux_audit.md` P1 "위치 출처 은폐" 지적과도 맞물린다.

> **폐기하는 것과 유지하는 것의 구분** (직전 초안에서 과잉 폐기했던 부분 정정):
> - **폐기** — *측위 실패 전반*에 조용히 `BEN_THANH_FALLBACK`을 채워 그것이 모든 화면의 기준이 되던 동작. 이게 사용자에게 아무 설명 없이 Bến Thành으로 수렴하던 원인이다.
> - **유지** — *권역 밖*을 명시적으로 감지해 **토스트로 알리고** 중심가로 안내하는 동작(`lib/serviceLocation.ts:21-32`). 이건 정상 동작이며 그대로 둔다.

---

## 5. 권한 프롬프트 완화 (§2 비용에 대한 대응)

진입 즉시 시스템 권한창을 띄우면 이탈이 난다. **최초 1회만 자체 프리프롬프트**를 거친다.

```
(권한 미결정 상태에서 최초 진입 시에만)
  "내 주변 매물·주유소·날씨를 보여드리려면 위치가 필요해요"
  [허용하기]  [나중에 (전체 지역으로 보기)]
        │
    허용하기 → native.ensureLocationPermission() → 시스템 창
    나중에   → mode='all', 이후 세션에서 다시 묻지 않음
```

- 이미 허용/거부가 결정된 상태면 프리프롬프트 없이 바로 진행한다.
- 거부 이력이 있으면 재요청하지 않고 조용히 `'all'`로 간다(대표 지시 "안잡히면 전체지역"의 정신).

> **확인 요청 B** — 프리프롬프트를 넣을지, 아니면 그냥 바로 시스템 권한창을 띄울지. 대표님 성향상 "단순하게"를 원하실 수 있어 후자도 유효하다.

---

## 6. 화면별 변경 명세

### 6.1 마켓 `pages/market/MarketMain.tsx` (변경량 최대)

| 항목 | 현재 | 변경 후 |
|---|---|---|
| 상태 소스 | 독자 `localStorage 'mkt_filter_v2'` | `useLocationStore` 구독. `SavedState`에서 `locationMode/ward/coords/regionLabel/explicitLocal` **5필드 제거** (`sort/hideSold/viewMode/scrollTop`만 남김) |
| `locationMode` 타입 | `'all'\|'gps'\|'region'` | `'all'\|'gps'` |
| `handleDraftRegion` (L252-259) | 지역 draft 세팅 | **삭제** |
| `handleApplyLocation` (L261-282) | 3분기 | 2분기 (`all` / `gps`) |
| `clearRegionFilter` (L288-294) | 칩 ✕ 핸들러 | **삭제** (칩 자체 제거) |
| `?lat=&lng=` 쿼리 소비 (L201-220) | 홈→마켓 좌표 인계 | **삭제** — 스토어가 좌표를 공유하므로 불필요 |
| 전역 스토어 동기화 이펙트 (L~195) | `setLocationMode('region')` | **삭제** |
| `AreaPill` 렌더 (L646-654) | `locationMode!=='all'`일 때 표시 | **삭제** (D6) |
| `SaigonMapV5 polyActive` (L620) | `locationMode!=='all'` | `false` 고정 (D5) |
| `SaigonMapV5 activeRegionAt` (L621) | `coords` | `null` (D5) |
| `SaigonMapV5 locateOnMount` (L607) | `locationMode==='all'` | `mode==='gps'` — 카메라를 GPS로 (D5) |
| `meDotOnMount` (L611) | `locationMode!=='all'` | `true` 고정 (항상 파란 점) |
| 줌 게이트 (L661-672) | 유지 | **유지** (D7) |
| 목록 조회 | `wardId` 필터 | `lat/lng + radiusKm=5` (D4). `'all'`이면 세 파라미터 모두 미전달 |

### 6.2 동네지도 `pages/map/NeighborhoodMap.tsx` / `NeighborhoodMapCanvas.tsx`

- `regionMode: 'all'|'gps'|'region'` → `'all'|'gps'`, `regionScoped`/`selectedRegion` 분기 제거 (L85-98).
- 초기 bbox (L140): `regionBbox(selectedRegion)` → **GPS 좌표 중심 3km bbox**, `'all'`이면 `HCMC_BBOX`.
- `initialRegion` prop (L264) 제거.
- 헤더 라벨 (L281,402): `selectedRegion.name` → `wardName ?? t('market.currentLocation')`.
- **동 폴리곤 탭 → 지역 선택 동작 제거** (`SaigonMapV5 onRegionSelect`). 탭은 이제 아무 필터도 걸지 않는다.
- 줌 게이트·파란 점 유지.

### 6.3 홈 `pages/home/WorldMapV2.tsx`

- L225-230: `coords`를 저장 위치/`FALLBACK`이 아니라 **스토어의 GPS 좌표**로 세팅.
- L235 주석("표시 전용이다…") 및 그 제약 **폐기** — `gpsWardName`이 곧 조회 기준이 된다.
- L262/265 `fetchListings`: `sort:'distance'`에 `radiusKm=5` 추가.
- `'all'` 모드면 `radiusKm` 미전달 + `sort:'recent'`로 (거리 기준이 없으므로).
- ⚠️ `wardRegionAt()` 폴리곤은 **중심부 37개 동만** 커버 → Thủ Đức·Bình Tân·Gò Vấp은 이름 해석이 `null`이 된다. 이때 **`'all'`로 떨어뜨리지 말고** 좌표 기반 반경 필터는 그대로 쓰되 라벨만 폴백한다 (§4.1 "wardName은 라벨 전용").

### 6.4 정보 화면 `hooks/useServiceLocation.ts` → 주유·날씨(+정비·침수)

```ts
// 현재: region(수동선택) → centroid, 없으면 도시중심
// 변경: mode==='gps' ? gpsCoords : HCMC_DEFAULT_CENTER
export function useServiceLocation() {
  const { mode, coords, wardName } = useLocationStore();
  const origin = mode === 'gps' && coords ? coords : HCMC_DEFAULT_CENTER;
  return { origin, label: mode === 'gps' ? wardName : null };
}
```

- `useSelectedRegion` 의존 제거.
- `components/info/LocationContextBar.tsx`의 **지역 피커 제거** → 2옵션 토글로 대체(마켓 시트와 동일 컴포넌트 재사용).
- 대표님이 지목한 **주유소·날씨(강수)**가 여기 포함. 정비·침수도 같은 훅을 쓰므로 자동 반영된다.

### 6.5 표시범위 시트 — `MarketMain.tsx` 인라인 (L783-854)

> **정정 (구현 중 발견)**: 초안은 이 시트가 `pages/market/LocationPickerSheet.tsx`에 있다고 적었으나 **틀렸다**. 표시범위 3옵션 시트는 `MarketMain.tsx` 안에 인라인 `<BottomSheet>`로 렌더된다. `LocationPickerSheet.tsx`는 **매물 등록·약속잡기의 "거래 희망 장소" 피커**로 이번 건과 무관하며 **손대지 않는다**.

- 카드 3개 → 2개: `market.allAreas` / `market.currentLocation` 유지, **`market.selectArea` 카드 삭제**(L815-827).
- 지역 선택 시 열리던 `SaigonMapV2` 패널(L829-843) **삭제** → `SaigonMapV2` import도 함께 정리(내 변경으로 생긴 고아).
- `market.selectArea` / `locationMetaRegion` / `locationMetaPick` i18n 키는 **사용처만 제거**하고 키 자체는 남긴다(무관한 dead code 삭제 금지, 카파시 #3).
- 이 시트를 정보 화면에서도 쓰려면 공용 컴포넌트로 추출 — §6.4에서 처리.

### 6.6 BFF `backend/app/routers/market.py`

- `list_listings`에 `radius_km: float | None = Query(None)` 추가.
- `lat/lng`가 있고 `radius_km`가 오면 `ST_DWithin(..., radius_km*1000)` 조건 추가 (`q`와 `count_q` **양쪽 모두** — 한쪽만 걸면 페이지네이션 총계가 어긋난다).
- 기존 `ward_id`/`district_id` 파라미터는 **그대로 둔다** — 어드민·내 매물 등 다른 호출부가 쓴다. 프론트의 지역 필터 호출부만 사라진다.

---

## 7. 삭제/폐기 목록

| 대상 | 위치 | 처리 |
|---|---|---|
| `useLocationStore.region` / `selectRegion()` | `store/useLocationStore.ts` | 삭제 |
| `useSelectedRegion` | 동상 | 삭제 (사용처 전부 제거됨) |
| `AreaPill` 렌더 | 마켓·동네지도 | 렌더 삭제. **컴포넌트 파일은 존치**(다른 사용처 확인 후 판단) |
| `BEN_THANH_FALLBACK`의 필터 기준 용도 | `lib/serviceLocation.ts:29` | 카메라 기본값으로만 격하 |
| `mkt_filter_v2` 의 위치 5필드 | `MarketMain.tsx` | 삭제 + 키를 **`mkt_filter_v3`** 로 올려 구버전 값 격리(마이그레이션 코드 불필요) |
| `service-rules.md` GPS 원칙 1·2, 예외 4 | `ai-docs/context/service-rules.md` | **개정** (§2) |

---

## 8. 검증 목표 (카파시 #4 — 통과 조건)

각 항목은 "동작하게 해줘"가 아니라 재현 가능한 판정으로 쓴다.

| # | 시나리오 | 통과 조건 |
|---|---|---|
| V1 | GPS 허용, `Thạnh Mỹ Tây` 좌표 주입 → 홈 진입 | 헤더 `Thạnh Mỹ Tây` **&** 근처 상품 배지가 반경 3km 내 동들. `Bến Thành` 고정 노출 없음 |
| V2 | 동일 상태로 홈→마켓→동네지도→주유소→날씨 순회 | 5화면 모두 같은 기준 좌표. 화면마다 다른 지역명이 뜨지 않음 |
| V3 | GPS 거부 상태로 앱 재시작 | 5화면 모두 `Toàn bộ khu vực`. 토스트 **정확히 1회** |
| V4 | GPS 성공 후 앱 재시작 | 모드 `gps` 유지, 좌표는 **재측위**된 값 (localStorage 잔존 좌표 사용 안 함) |
| V5 | 표시범위 시트 열기 | 옵션 **2개만**. 지역 선택 진입점 없음 |
| V6 | 마켓 지도 진입 | 좌하단 지역칩 없음. 주황 **선택 강조** 경계·외부 마스크 없음. **동 경계선·라벨은 존재**. **줌 게이트 필도 존재** |
| V7 | 구경계에 걸친 매물 (내 위치 2.8km, 다른 ward) | 목록에 **포함**됨 (D4 반경 기준 확인) |
| V8 | 서비스권역 밖 좌표 주입 (37개 동 폴리곤 밖, 예: Bình Dương) | `map.outsideArea` 토스트 + **모드는 `gps` 유지, 기준 좌표는 Bến Thành**, 반경 3km 목록이 채워짐. `coordsSource==='fallback'`이라 라벨에 "내 현재 위치"를 쓰지 않음 |
| V8b | 측위 실패(권한 거부)와 V8을 구분 | V8은 `gps`+중심가, 거부는 `all`. 두 경우가 같은 화면이 되면 안 됨 |
| V9 | 구버전 `mkt_filter_v2` (`locationMode:'region'`) 잔존 상태로 진입 | 크래시·빈 화면 없이 `gps`로 정상 진입 |
| V10 | `radius_km` 붙은 목록 API 페이지네이션 | 2페이지 이후에도 총계·항목 정합 (count_q 동시 적용 확인) |

### 구현 후 실제 처리 (2026-08-06)

| 검증 축 | 어디서 고정했나 | 결과 |
|---|---|---|
| V4·V8·V8b·폴백 정책·프리프롬프트 | `src/store/useLocationStore.contract.test.mjs` (16 subtest) | ✅ 통과 |
| V10 (+반경 미터 변환, ward 무관성) | `backend/app/tests/test_market_listings_radius.py` (6 test) | ✅ 통과 |
| 정보 4화면이 스토어를 따르는지 | `src/pages/info/infoLaunchSafety.contract.test.mjs` (구 "날씨는 GPS 미사용" 계약 교체) | ✅ 통과 |
| V5·V6 (2옵션·칩 없음·강조 없음·경계선 유지·줌게이트 유지) | `e2e/map-consistency.spec.ts` P1/P3/P4/P6/P7 재작성 | e2e |
| V9 | `mkt_filter_v3` 키 분리로 구조적 해소(구버전 값을 읽지 않음) | 코드로 보장 |

**폐기한 e2e**: `e2e/region-clear-keeps-viewport.spec.ts` — 지역칩 ✕ 회귀 감시 전용인데 그 기능이 사라져 전제가 없다.

**미검증으로 남은 것**: V1·V2·V3·V7 은 시드 데이터(반경 내 매물 분포)와 다중 화면 순회가 필요해 자동화하지 않았다 — 실기기/스테이징 수동 확인 대상.

---

## 9. 구현 순서 (검증 게이트 포함)

```
1. useLocationStore 재정의 + ensureLocation/폴백/토스트 1회
   → 검증: 단위 테스트 (권한거부/타임아웃/권역밖 3케이스 → mode='all', 토스트 1회)
2. BFF radius_km 추가
   → 검증: V10 (q/count_q 동시 적용)
3. 마켓 배선 (독자 상태 제거 + 시트 2옵션 + 칩/폴리곤 제거)
   → 검증: V5, V6, V7, V9
4. 동네지도 배선
   → 검증: V2 (마켓↔동네지도 동일 기준)
5. 홈 배선 (표시전용 제약 폐기)
   → 검증: V1
6. useServiceLocation → 주유·날씨·정비·침수
   → 검증: V2 (5화면 순회)
7. 권한 프리프롬프트 (§5, 확인 요청 B 결과에 따라)
   → 검증: V3, V8
8. service-rules.md 개정 + e2e 재작성 + 재인덱싱(index_repository)
```

3~6은 순차 의존이 아니므로 병렬 가능하나, **1이 끝나기 전에는 착수 불가**.

---

## 10. 남은 확인 요청 정리

| ID | 질문 | **확정 (2026-08-06)** |
|---|---|---|
| A | `service-rules.md` GPS 원칙 1·2 폐기? | ✅ **폐기 확정.** 권한 프롬프트 노출·UX 감사 P1 승격·스토어 심사 목적문자열 정비를 감수한다 |
| B | 권한 프리프롬프트 vs 바로 시스템 창 | ✅ **프리프롬프트 넣는다** (§5 그대로) |
| C | 반경 크기 | ✅ **3km** — `NEARBY_RADIUS_KM = 3` 상수로 분리 |
| D | "특정 동만 보기" 완전 제거 (동 폴리곤 탭 필터 포함) | ✅ **제거 확정** |

> **C 확정에 따른 정정**: 본 문서에서 "반경 3km"로 쓰인 모든 곳(D4, §6.1/6.2/6.3, V7)은 **3km**로 읽는다. V7 시나리오의 예시 거리도 4.8km → 2.8km.

---

**A~D 확정 완료. §9 순서대로 구현 착수.**
