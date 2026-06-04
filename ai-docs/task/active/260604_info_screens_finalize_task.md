# info 화면 마무리 — 4모듈 유기적 통합·통일성·정확한 초기 seed

> **Plane**: SGR-236 (parent) · SGR-237~240 (sub) · 발행 2026-06-04
> **SoT**: 진행상태는 Plane. 본 문서는 점검 결과·범위·검증 기준 기록.
> **스펙 원본**: [`ai-docs/spec/G-info-modules-spec.md`](../../spec/G-info-modules-spec.md)

## 배경

정보 모듈(날씨/침수/주유/정비) 4화면의 **골격은 완성** — 라우팅(`App.tsx:243-250`), BFF 라우터 4종(`info_{weather,flood,gas,repair}.py`), 8개 화면 컴포넌트 존재. 게임허브 진입(`GameHubSheet`)도 연결됨. 남은 "마무리"를 유기적·통일성 있게 닫는다.

**핵심 전제(사용자 확정)**: 제보(UGC) 기반 데이터 업데이트라도 **초기 seed는 정확해야 함**. 가짜 숫자 금지(스펙 §1.3 "거짓말 안 하기").

## 점검 결과 (2026-06-04)

| 항목 | 상태 |
|---|---|
| 화면·라우팅·BFF 라우터 | ✅ 전부 존재 |
| 비 레이더 | ⚠️ `InfoWeather.tsx:85` CSS 가짜 목업(도로/blob). `getRainRadar`(RainViewer 타일) API는 있으나 **미사용** |
| 유가 v2 | 🟡 `InfoGasList` v2(getTodayPrices/getStation 바텀시트) 배선됨. 단 **유가 후속 #50**(admin 가격 입력 페이지·WorldMap 위젯) 미완 |
| 초기 seed | 🔴 `gas_station`/`repair_shop`/`repair_review`/`fuel_price_official` **INSERT 0건**. `repair_service_type` lookup·`flood_hotspot`(037, 1건)만 시드. → 현재 화면이 채워져 보이는 건 **프론트 MOCK** 덕분. 운영(`USE_MOCK=false`)서 주유·정비 빈 목록 |

## 범위 (work-stream)

### P1 — 비 레이더 실연동 (SGR-237)
- `InfoWeather.tsx:85` CSS 목업 → 실제 RainViewer 타일 레이어 교체.
- `weatherApi.getRainRadar(lat,lng)` 이미 존재(BFF `info_weather.py` rain-radar). 타일 오버레이 + `last_updated` 표기.
- 통일성: 침수지도(`SaigonDistrictMap`) 시각 톤과 맞추기.
- **검증**: 우기 좌표 실타일 렌더 + `USE_MOCK` 양분기 동작.

### P2 — 유가 후속 #50 (SGR-238)
- 유가 v2 파이프라인(`fuel_price_snapshot/report/fetch_log`, `042_fuel_price_v2`)은 존재.
- 잔여: ① admin 가격 입력/관리 페이지(공식가 수동 갱신), ② WorldMap 위젯 유가 표기, ③ `InfoGasList` nearby-v2 정합 확인.
- **검증**: admin 가격 입력 → InfoGasList/허브 카드 반영.

### P3 — 초기 seed 정확화 (SGR-239)
- OSM import(주유소/정비소 위치) + District 1·Bình Thạnh 집중 정확 시드 + `fuel_price` 공식가 시드.
- `database/init` seed SQL 추가. 스펙 G §7 시드 목표 참조.
- **검증**: `USE_MOCK=false`로 4화면 비어있지 않고 좌표·가격·평점이 실제값.

### P4 — 전체 시각 QA·통일성 폴리시 (SGR-240)
- ① mock↔실API 응답 정합(필드 누락/형 불일치), ② UI 통일(카드 톤·`var(--status-bar-height)`·i18n ko/en/vi 키 누락), ③ 엣지케이스(빈 목록·로딩·에러·위치 거부 폴백), ④ `AppImage` 래핑·`navigator.*` 금지 규약 점검.
- **검증**: 4화면 라이트/다크·3언어·빈데이터 상태 시각 확인.

## 의존·순서

P3(seed) → P4(QA)는 선행. P1/P2는 독립 병렬 가능. seed 없이 QA하면 빈 목록만 확인됨.
