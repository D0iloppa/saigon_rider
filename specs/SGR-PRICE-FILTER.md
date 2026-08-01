# SGR-PRICE-FILTER — #4 가격대 필터 + sort 검색 노출 스펙

> 우선순위: **P1**
> 범위: 프론트엔드 전용. sort는 **이미 구현돼 있어 노출만 하면 됨.**
> 선행 조건: 없음. 독립 실행 가능.

---

## 배경 & 목적

베트남 중고거래 1순위 동기는 **가격**이다. 그런데 현재 `MarketSearch`에는 가격대 필터가 없다. 추가로 sort(정렬)는 `MarketMain`에는 있지만 `MarketSearch`엔 미노출 상태다.

---

## 현재 상태 (코드 확인)

**MarketSearch.tsx**
- 필터: 키워드(디바운스 300ms) + 카테고리 트리 **만** 존재
- 가격/상태/정렬 파라미터 `fetchListings` 호출에 **미전달**

```ts
// MarketSearch.tsx:49 현재
fetchListings({ q: debounced, categoryId: category?.id ?? null, hideSold: true, viewerId: userId, page, size: 20 })
```

**`ListingQuery`에는 이미 있는 필드:**
```ts
// api/market.ts:137-149
export interface ListingQuery {
  q?: string;
  categoryId?: number | null;
  sort?: ListingSort;       // ← 이미 있음
  hideSold?: boolean;       // ← 이미 있음
  // priceMin/priceMax 는 현재 없음 → 추가 필요
  …
}
```

**`ListingSort`:**
```ts
export type ListingSort = 'recent' | 'price_low' | 'price_high' | 'distance';
// MarketMain의 SORTS: ['recent', 'distance', 'price_low', 'price_high']
```

---

## 변경 범위

### 1. `api/market.ts` — ListingQuery에 가격 필터 추가

```ts
export interface ListingQuery {
  q?: string;
  categoryId?: number | null;
  sort?: ListingSort;
  hideSold?: boolean;
  priceMin?: number | null;   // 추가
  priceMax?: number | null;   // 추가
  lat?: number | null;
  lng?: number | null;
  districtId?: number | null;
  viewerId?: string | null;
  page?: number;
  size?: number;
}
```

`fetchListings` 내부에서 쿼리 파라미터에 포함:
```ts
if (q.priceMin != null) params.append('price_min', String(q.priceMin));
if (q.priceMax != null) params.append('price_max', String(q.priceMax));
```

### 2. `MarketSearch.tsx` — 필터 상태 + UI 추가

**상태 추가:**
```ts
const [sort, setSort] = useState<ListingSort>('recent');
const [priceMin, setPriceMin] = useState<number | null>(null);
const [priceMax, setPriceMax] = useState<number | null>(null);
const [filterOpen, setFilterOpen] = useState(false);
```

**fetchPage 호출 갱신:**
```ts
const fetchPage = useCallback(
  (page: number) =>
    fetchListings({
      q: debounced,
      categoryId: category?.id ?? null,
      sort,
      hideSold: true,
      priceMin,
      priceMax,
      viewerId: userId,
      page,
      size: 20,
    }),
  [debounced, category, sort, priceMin, priceMax, userId],
);
```

**헤더 필터 버튼 — 기존 카테고리 버튼 옆에 추가:**
```tsx
{/* 기존 카테고리 필터 버튼 아래 */}
<div className={styles.filterRow}>
  <button
    className={`${styles.filterChip} ${category ? styles.active : ''}`}
    onClick={() => setCatSheetOpen(true)}
  >
    <SlidersHorizontal size={14} />
    {category ? localizedName(category) : t('market.catFilter', { defaultValue: '카테고리' })}
  </button>

  <button
    className={`${styles.filterChip} ${(priceMin || priceMax) ? styles.active : ''}`}
    onClick={() => setFilterOpen(true)}
  >
    {(priceMin || priceMax)
      ? `₫${(priceMin ?? 0).toLocaleString('vi-VN')} – ${priceMax ? `₫${priceMax.toLocaleString('vi-VN')}` : '∞'}`
      : t('market.priceFilter', { defaultValue: '가격대' })}
  </button>

  <button
    className={`${styles.filterChip} ${sort !== 'recent' ? styles.active : ''}`}
    onClick={() => setSortOpen(true)}
  >
    {t(`market.sort_${sort}`)}
  </button>
</div>
```

**가격 필터 BottomSheet:**
```tsx
<BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
  <div className={styles.priceSheet}>
    <h2>{t('market.priceFilter', { defaultValue: '가격대' })}</h2>

    {/* 프리셋 칩 */}
    {PRICE_PRESETS.map((p) => (
      <button
        key={p.label}
        className={`${styles.presetChip} ${priceMax === p.max && priceMin === p.min ? styles.active : ''}`}
        onClick={() => { setPriceMin(p.min); setPriceMax(p.max); setFilterOpen(false); }}
      >
        {p.label}
      </button>
    ))}

    {/* 직접 입력 */}
    <div className={styles.priceInputRow}>
      <input
        type="number"
        placeholder="₫ 최소"
        value={priceMin ?? ''}
        onChange={(e) => setPriceMin(e.target.value ? Number(e.target.value) : null)}
      />
      <span>–</span>
      <input
        type="number"
        placeholder="₫ 최대"
        value={priceMax ?? ''}
        onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : null)}
      />
    </div>

    <Button onClick={() => setFilterOpen(false)} fullWidth>
      {t('common.apply', { defaultValue: '적용' })}
    </Button>
    {(priceMin || priceMax) && (
      <button className={styles.clearBtn} onClick={() => { setPriceMin(null); setPriceMax(null); }}>
        {t('market.filterClear', { defaultValue: '초기화' })}
      </button>
    )}
  </div>
</BottomSheet>

{/* 정렬 시트 — MarketMain과 동일 구조 */}
<BottomSheet open={sortOpen} onClose={() => setSortOpen(false)}>
  …SORTS.map… (MarketMain.tsx:232-245와 동일 패턴)
</BottomSheet>
```

**가격 프리셋 상수 (베트남 현실 반영):**
```ts
const PRICE_PRESETS = [
  { label: '5만 이하',   min: null,      max: 50_000 },
  { label: '5~20만',    min: 50_000,    max: 200_000 },
  { label: '20~50만',   min: 200_000,   max: 500_000 },
  { label: '50만~200만', min: 500_000,   max: 2_000_000 },
  { label: '200만 이상', min: 2_000_000, max: null },
] as const;
```
(VND 기준. 5만₫≈약 3,000원. 오토바이 부품 실거래 범위 커버.)

### 3. 백엔드 — `GET /market/listings` 파라미터

BFF `market.py` 라우터에서 `price_min`, `price_max` 쿼리 파라미터를 받아 DB 필터로 전달:
```python
# price_min, price_max: Optional[int] = None
if price_min is not None:
    q = q.filter(Listing.price_vnd >= price_min)
if price_max is not None:
    q = q.filter(Listing.price_vnd <= price_max)
```

---

## 수용 기준 (Done)

- [ ] `MarketSearch` 화면에 **가격대 필터 칩**이 보인다
- [ ] 가격대 프리셋 5종 + 직접 입력이 동작한다
- [ ] 가격 필터 적용 시 결과 리스트가 재요청된다
- [ ] **정렬 드롭다운(sort)**이 검색 화면에 노출되고, 선택 시 재검색된다
- [ ] 필터 active 상태가 칩에 시각적으로 표시된다
- [ ] 초기화(clear) 버튼이 동작한다
- [ ] 빌드·ESLint 통과

## 제외 범위
- 거리(distance) 필터 — 별도 티켓
- 상태(상품상태 등급) 필터 — #3 스펙 구현 후 연동
- 검색 최근/인기 키워드 — 별도 티켓
