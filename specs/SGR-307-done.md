# SGR-307 완료 보고서 — 신뢰 지표 교체

**상태**: Done ✓ | **완료일**: 2026-06-22  
**Plane**: SGR-307 (parent: 고도화 계획)

---

## 변경 내용 요약

| 파일 | 변경 |
|---|---|
| `frontend/src/api/market.ts` | `SellerBrief`에 `reviewCount / avgRating / responseRate / isPhoneVerified` 추가 + `ListingQuery`에 `priceMin / priceMax` 추가 + `fetchListing` 셀러 변환에 폴백 기본값 |
| `frontend/src/pages/market/marketFormat.ts` | `formatRating / formatReviewCount / formatResponseRate` 3종 포매터 추가 |
| `frontend/src/pages/market/MarketDetail.tsx` | `.mannerBadge` → `.trustBadges` div 교체, import 확장 |
| `frontend/src/pages/market/MarketDetail.module.css` | `.mannerBadge` 제거 → `.trustBadges` + `.trustChip` 신규 |
| `frontend/src/locales/vi/translation.json` | `reviewCount / responseVeryFast / responseNormal / phoneVerified / verified` 5키 추가 |
| `frontend/src/locales/en/translation.json` | 동일 5키 영문 |
| `frontend/src/locales/ko/translation.json` | 동일 5키 한국어 |

---

## 수용 기준 달성

- [x] `MarketDetail` 셀러 행에 **인증 배지(조건부) · 별점 · 거래건수 · 응답률(조건부)** 노출
- [x] 매너온도(°C)가 화면에서 사라짐 (함수 코드는 타 참조 가능성으로 잔존)
- [x] 백엔드 미배포 시 폴백: `reviewCount=0`, `avgRating=null` → 별점 "—", 거래 0건, 응답률 미표시로 렌더 오류 없음
- [x] `npm run build` 성공 (48.52s, 오류 없음)

---

## 렌더 결과 (백엔드 미배포 상태)

```
셀러 행:
  [—]  [거래 0건]
  (isPhoneVerified=false → 인증 칩 미표시)
  (responseRate=null → 응답률 칩 미표시)
```

백엔드가 실제 값을 내려주면:
```
  [✓ 인증]  [⭐ 4.8]  [거래 12건]  [응답 빠름]
```

---

## 백엔드 후속 작업 (별도 티켓)

`/market/listings/:id` 응답의 `seller` 객체에 신규 필드 추가 필요:

```python
# backend/app/schemas.py
class SellerBriefSchema(BaseModel):
    ...
    review_count: int = 0
    avg_rating: float | None = None
    response_rate: float | None = None
    is_phone_verified: bool = False
```

DB 쿼리에서 `review_count`(completed appointment 수), `avg_rating`(리뷰 평균), `response_rate`(DM 응답률) 집계 필요.

---

## 다음 작업 — SGR-308

**B. 가격 필터 + sort 검색 노출**

`ListingQuery.priceMin / priceMax`는 이번 커밋에 포함됨. 남은 작업:
- `MarketSearch.tsx` — 가격 필터 상태 + BottomSheet + sort 칩 UI
- `MarketSearch.module.css` — `.filterRow / .filterChip / .priceSheet` 등
- 백엔드 `GET /market/listings` — `price_min / price_max` 쿼리 파라미터 + DB 필터

스펙: `specs/SGR-PRICE-FILTER.md`
