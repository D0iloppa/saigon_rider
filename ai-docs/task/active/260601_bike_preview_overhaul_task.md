# 바이크 프리뷰 레이아웃/스켈레톤 전면 정비 (2026-06-01)

> **Status**: ✅ DONE (배포·시각검증 완료 2026-06-01)
> **Plane Todo**: SGR-202
> **선행**: 라이더 프리뷰 정비(SGR-201 연장 — PANTS/KNEE 좌표·스켈레톤 다리·자켓 소매·viewBox 쉬프트 해결)

## 목적

라이더 프리뷰를 정비한 것과 동일 패턴으로 **바이크 프리뷰**를 전면 정비한다. 대량작업이라 SGR-201과 분리.

## 예상 영향 계층 (라이더 정비와 대칭)

1. **스켈레톤** `item-BIKE_BASE_EMPTY_C_00` (viewBox `0 0 400 200`) 기하 재정비
2. **`BIKE_LAYOUT`** (`frontend/src/lib/items/slotLayout.ts`) 슬롯 attach 좌표·zOrder — BODY·ENGINE·SEAT·STICKER·HANDLE·MIRROR·LIGHT·TAIL·NUMBER·WHEEL
3. **바이크 파츠 SVG 심볼** 정합 (크기/위치/디테일)
4. **썸네일 viewBox** (`SLOT_VIEWBOX`, `metadata.ts`) 중앙정렬 — 라이더 자켓에서 발견된 **음수 origin viewBox 쉬프트** 이슈 동일 점검 필요
5. **Garage 바이크 탭 칩** (`Garage.tsx` `TABS.bike`) 순서/배치

## 참고 — SGR-201에서 이미 완료된 바이크 관련분

- WHEEL 슬롯 pair 렌더 (전/후륜 cx82/cx315, base r34)
- WHEEL **회전 효과**: `BikeComposite.tsx` `sr-wheel-spin` CSS 애니(장착 프리뷰 한정)
- WHEEL 심볼 5종(C/R/E/L/M) + 시드/enum/상점 그룹 등록
- SGR-200: bike 탭 칩 순서·BIKE_LAYOUT 일부 좌표 튜닝

## 다음 액션

- [ ] 바이크 탭 스크린샷 리뷰 → 구체 결함 enumerate (서브항목화)
- [ ] 결함별 좌표/아트 수정 → frontend 재빌드 → 시각검증 반복

## 핵심 교훈 (라이더에서 이월)

- **음수 origin viewBox 금지**: 심볼 viewBox를 `0 0 ...`로 두고 여백이 필요하면 `<g transform="translate(...)">` 래핑. 음수 origin은 `<use>` 기본 뷰포트(x=0)와 겹쳐 쉬프트 발생(프리뷰·썸네일 공통).
- 합성 좌표(slotLayout point.viewBox)와 썸네일 좌표(SLOT_VIEWBOX)는 **독립** — 따로 튜닝 가능.
- `RiderComposite`/`BikeComposite`는 zOrder 정렬이 아니라 **배열 순서**로 페인트(나중=위층).
