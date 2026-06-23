# SGR-308 완료 보고서 — 가격대 필터 + sort 검색 노출

**상태**: Done ✓ | **완료일**: 2026-06-22  
**Plane**: SGR-308 (parent: 고도화 계획)

---

## 변경 내용 요약

| 파일 | 변경 |
|---|---|
| `backend/app/routers/market.py` | `GET /market/listings`에 `price_min / price_max` 쿼리 파라미터 + DB 필터 (`price_vnd >= / <=`) |
| `frontend/src/pages/market/MarketSearch.tsx` | sort/priceMin/priceMax/filterOpen/sortOpen 상태 추가 + fetchPage 갱신 + 필터 행 UI + 가격 BottomSheet + 정렬 BottomSheet |
| `frontend/src/pages/market/MarketSearch.module.css` | `.catFilter` → `.filterRow / .filterChip / .filterChipActive` 교체 + `.filterSheet / .presetChip / .priceInputRow / .sortOption` 등 신규 |
| `frontend/src/locales/vi/translation.json` | `priceFilter`, `filterClear` 추가 |
| `frontend/src/locales/en/translation.json` | 동일 영문 |
| `frontend/src/locales/ko/translation.json` | 동일 한국어 |

*(SGR-307에서 이미 처리: `api/market.ts` `ListingQuery.priceMin / priceMax`)*

---

## 수용 기준 달성

- [x] `MarketSearch` 헤더에 **카테고리 · 가격대 · 정렬** 3개 필터 칩 노출
- [x] 가격 프리셋 5종 (5만 이하 / 5~20만 / 20~50만 / 50만~200만 / 200만 이상) + 직접 입력 동작
- [x] 정렬 (최신 / 가격 낮은 순 / 가격 높은 순) BottomSheet 노출
- [x] 필터 active 상태 시각 표시 (칩 배경 반전)
- [x] 초기화 버튼 동작 (가격 필터 시트 내)
- [x] 필터 변경 시 `fetchPage` 재트리거 (의존 배열에 `sort, priceMin, priceMax` 포함)
- [x] 백엔드 `price_min / price_max` DB 필터 적용
- [x] `npm run build` 성공 (42.18s, 오류 없음)

---

## UI 구조

```
[헤더]
  [카테고리 칩]  [가격대 칩]  [정렬 칩]   ← 가로 스크롤

[가격 BottomSheet]
  프리셋: [5만 이하] [5~20만] [20~50만] [50만~200만] [200만 이상]
  직접 입력: [₫ 최소] – [₫ 최대]
  [적용 버튼]
  [초기화]

[정렬 BottomSheet]
  최신 / 가격 낮은 순 / 가격 높은 순
```

---

## 설계 노트

- `distance` 정렬은 MarketMain(GPS 위치 있음)에서만 의미 있어 MarketSearch에서는 제외.
- 프리셋 선택 시 시트 자동 닫힘. 직접 입력은 "적용" 버튼으로 닫음.
- 가격 칩 레이블: active 시 `₫50.000 – ₫200.000` 형태로 현재 범위 표시.
- `catFilter` CSS 클래스를 `filterChip`으로 통합 (UI 일관성). 기존 `.catFilter` 클래스는 삭제.

---

## 다음 작업 — SGR-309 (스프린트 QA)

SGR-307 + SGR-308 모두 Done. `specs/SGR-SPRINT1.md` 시나리오 1~3 QA 진행 가능.

| 시나리오 | 검증 내용 |
|---|---|
| 1 | 가격 필터 → 리스트 재요청 → MarketDetail 신뢰 배지 확인 |
| 2 | 직접 입력 min/max → 칩 레이블 업데이트 → 초기화 |
| 3 | 백엔드 미배포 상태에서 신뢰 배지 폴백 (렌더 오류 없음) |
