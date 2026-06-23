# SGR-SPRINT1 — 1차 스프린트: 신뢰 배지 + 가격 필터

> 스프린트 목표: **"베트남 사용자가 신뢰할 수 있는 검색·상세 화면"**
> 포함 티켓: SGR-TRUST-BADGE(#1) + SGR-PRICE-FILTER(#4)
> 예상 공수: 프론트 2~3일 + 백엔드 0.5일
> 선행 조건: 없음. 두 티켓 모두 독립 실행 가능, 병렬 진행 권장.

---

## 왜 이 두 개를 묶는가

| | SGR-TRUST-BADGE | SGR-PRICE-FILTER |
|---|---|---|
| 사용자 페인 | 베트남 신뢰 시그널 부재 (사기 공포 최대 장벽) | 가격이 1순위 동기인데 필터 없음 |
| 코드 범위 | `MarketDetail.tsx`, `marketFormat.ts` | `MarketSearch.tsx`, `api/market.ts` |
| 충돌 여부 | 없음 (파일 겹침 없음) | 없음 |
| 백엔드 필요 | 신규 필드 폴백 가능 (선배포 무방) | price_min/max 쿼리 파라미터 추가 |

두 티켓이 **파일을 공유하지 않아 병렬 개발 가능**. 검색→상세 동선이 핵심 플로우이므로 같이 묶어 QA하면 전체 흐름을 한 번에 검증할 수 있다.

---

## 스프린트 범위 (전체 파일 목록)

### 프론트엔드

| 파일 | 변경 내용 | 티켓 |
|---|---|---|
| `src/api/market.ts` | `SellerBrief`에 `reviewCount/avgRating/responseRate/isPhoneVerified` 추가 + `ListingQuery`에 `priceMin/priceMax` 추가 | #1 + #4 |
| `src/pages/market/marketFormat.ts` | `formatRating`, `formatReviewCount`, `formatResponseRate` 추가 | #1 |
| `src/pages/market/MarketDetail.tsx` | 셀러 행 `.mannerBadge` → `.trustBadges` 교체 | #1 |
| `src/pages/market/MarketDetail.module.css` | `.trustBadges`, `.trustChip` 추가 | #1 |
| `src/pages/market/MarketSearch.tsx` | 가격 필터 상태 + BottomSheet + sort 칩 추가 | #4 |
| `src/pages/market/MarketSearch.module.css` | `.filterRow`, `.filterChip`, `.priceSheet`, `.priceInputRow`, `.presetChip` 추가 | #4 |
| `src/locales/vi/translation.json` | 신뢰 배지 키 + 가격 필터 키 추가 | #1 + #4 |
| `src/locales/en/translation.json` | 동일 | #1 + #4 |
| `src/locales/ko/translation.json` | 동일 | #1 + #4 |

### 백엔드

| 파일 | 변경 내용 | 티켓 |
|---|---|---|
| `backend/app/routers/market.py` | `GET /market/listings` — `price_min`, `price_max` 쿼리 파라미터 + DB 필터 | #4 |
| `backend/app/schemas.py` | `SellerBriefSchema` — `review_count`, `avg_rating`, `response_rate`, `is_phone_verified` 추가 | #1 |

---

## 작업 순서

```
Day 1 (병렬)
├── A: api/market.ts SellerBrief + ListingQuery 타입 확장
└── B: 백엔드 price_min/max 쿼리 파라미터 추가

Day 2 (병렬)
├── A: marketFormat.ts 포매터 + MarketDetail.tsx 배지 교체
└── B: MarketSearch.tsx 가격 필터 + sort 칩

Day 3
└── i18n 3종 + CSS 마무리 + 통합 QA (검색→상세 플로우)
```

---

## 통합 QA 시나리오

### 시나리오 1 — 검색 → 상세 신뢰 확인
1. MarketSearch 진입
2. **가격대 필터 "5~20만" 선택** → 리스트 재요청, 해당 범위 매물만 표시
3. **정렬 "가격 낮은 순" 선택** → 재정렬 확인
4. 매물 탭 → MarketDetail 진입
5. 셀러 행에 **인증 배지(조건부)·별점·거래건수·응답률** 표시 확인
6. 매너온도(°C)가 화면에 없음 확인

### 시나리오 2 — 가격 직접 입력
1. 가격 필터 시트 → 직접 입력 (min: 100000, max: 500000)
2. 적용 → 칩에 "₫100.000 – ₫500.000" 표시
3. 초기화 → 칩 원상복귀

### 시나리오 3 — 백엔드 미배포 상태 (폴백)
1. `SellerBrief`의 신규 필드가 null/undefined로 내려올 때
2. 별점="—", 거래건수="거래 0건", 응답률=미표시 — **렌더 오류 없음**

---

## 스프린트 후 체크리스트

- [ ] SGR-TRUST-BADGE 수용 기준 전체 통과
- [ ] SGR-PRICE-FILTER 수용 기준 전체 통과
- [ ] 시나리오 1~3 QA 통과
- [ ] 빌드(`npm run build`) 오류 없음
- [ ] ESLint 통과
- [ ] 베트남어(`vi`) 레이블 검수

---

## 다음 스프린트 후보 (#2~#5)

| 티켓 | 내용 | 선행 조건 |
|---|---|---|
| **#2** | 거래방식 명시 필드 (현금/계좌/MoMo/COD) | #1 스프린트 후 |
| **#3** | 상품 상태 등급 + 영상 업로드 | 백엔드 스키마 |
| **#5** | 안전결제 에스크로-lite (MoMo/ZaloPay) | PDPL 동의 흐름 + 외부 API |
| **#7** | Zalo 연락 병행 (`zalo.me/<phone>`) | Decree 147 KYC 완료 후 |
