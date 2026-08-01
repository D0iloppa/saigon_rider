# SGR-TRUST-BADGE — #1 신뢰 지표 교체 스펙

> 우선순위: **P0 (단일 최대 임팩트)**
> 범위: 프론트엔드 전용 (백엔드 API 스키마 변경 없음, 기존 필드 재활용)
> 선행 조건: 없음. 독립 실행 가능.

---

## 배경 & 목적

현재 셀러 신뢰 지표는 **매너온도(36.5°C)**다 — `marketFormat.ts:26-37`, `MarketDetail.tsx:212`. 이는 한국 체면문화 산물로 베트남 사용자에게 직관적이지 않다.

베트남 C2C에서 실제로 작동하는 신뢰 시그널:
- **별점(rating)** — 거래 후기 평점
- **거래완료 N건** — 실거래 횟수
- **응답률** — 채팅 응답 속도
- **전화인증 배지** — Decree 147 준수 겸용

매너온도를 완전 제거하지 않고 **배지 묶음으로 교체/병기**해 서버 스키마 변경을 최소화한다.

---

## 현재 상태 (코드 확인)

```
// marketFormat.ts:26-37
export function mannerEmoji(temp: number): string { … }
export function formatMannerTemp(temp: number): string { return `${temp.toFixed(1)}°C`; }

// MarketDetail.tsx:212
<span className={styles.mannerBadge} title={t('market.mannerTemp', …)}>
  {mannerEmoji(detail.seller.mannerTemp)} {formatMannerTemp(detail.seller.mannerTemp)}
</span>

// api/market.ts:53 SellerBrief
export interface SellerBrief {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  mannerTemp: number;      // 현재
  isFollowing: boolean;
}
```

---

## 변경 범위

### 1. `api/market.ts` — SellerBrief 확장

```ts
export interface SellerBrief {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  mannerTemp: number;          // 유지 (하위호환)
  reviewCount: number;         // 추가: 거래 후기 수 (= 완료 거래)
  avgRating: number | null;    // 추가: 1~5점 평균, null=후기없음
  responseRate: number | null; // 추가: 0~100, null=채팅이력없음
  isPhoneVerified: boolean;    // 추가: Decree 147 전화인증 여부
  isFollowing: boolean;
}
```

백엔드가 아직 이 필드들을 내려주지 않으면 `transformSeller`에서 **기본값 폴백**:
```ts
reviewCount: r.review_count ?? 0,
avgRating: r.avg_rating ?? null,
responseRate: r.response_rate ?? null,
isPhoneVerified: r.is_phone_verified ?? false,
```
→ 백엔드 준비 전에도 프론트가 먼저 배포 가능.

### 2. `marketFormat.ts` — 신뢰 포매터 추가

```ts
/** 별점 표기: null이면 '후기없음', 있으면 ⭐4.8 */
export function formatRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return '—';
  return `⭐ ${avg.toFixed(1)}`;
}

/** 거래 완료 건수 */
export function formatReviewCount(count: number, t: TFunction): string {
  return t('market.reviewCount', { count, defaultValue: `거래 ${count}건` });
}

/** 응답률 */
export function formatResponseRate(rate: number | null, t: TFunction): string {
  if (rate === null) return '';
  if (rate >= 90) return t('market.responseVeryFast', { defaultValue: '응답 빠름' });
  if (rate >= 60) return t('market.responseNormal', { defaultValue: '응답 보통' });
  return '';
}
```

매너온도 함수(`mannerEmoji`, `formatMannerTemp`)는 **삭제하지 않는다** — 다른 코드가 참조할 가능성 있음. 단 `MarketDetail`에서만 교체.

### 3. `MarketDetail.tsx:211-213` — 셀러 배지 교체

**Before:**
```tsx
<span className={styles.mannerBadge} title={t('market.mannerTemp', …)}>
  {mannerEmoji(detail.seller.mannerTemp)} {formatMannerTemp(detail.seller.mannerTemp)}
</span>
```

**After:**
```tsx
<div className={styles.trustBadges}>
  {detail.seller.isPhoneVerified && (
    <span className={styles.trustChip} title={t('market.phoneVerified', { defaultValue: '전화 인증 완료' })}>
      ✓ {t('market.verified', { defaultValue: '인증' })}
    </span>
  )}
  <span className={styles.trustChip}>
    {formatRating(detail.seller.avgRating, detail.seller.reviewCount)}
  </span>
  <span className={styles.trustChip}>
    {formatReviewCount(detail.seller.reviewCount, t)}
  </span>
  {formatResponseRate(detail.seller.responseRate, t) && (
    <span className={styles.trustChip}>
      {formatResponseRate(detail.seller.responseRate, t)}
    </span>
  )}
</div>
```

### 4. CSS — `MarketDetail.module.css`

기존 `.mannerBadge`를 `.trustBadges` + `.trustChip`으로 교체:
```css
.trustBadges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.trustChip {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border-radius: 6px;
  padding: 3px 8px;
  white-space: nowrap;
}
.trustChip:first-child {
  color: var(--color-primary);
}
```

### 5. i18n 키 추가 (vi/en/ko 3종)

```json
// 추가할 키
"market.reviewCount": "Giao dịch {{count}}",
"market.responseVeryFast": "Phản hồi nhanh",
"market.responseNormal": "Phản hồi vừa",
"market.phoneVerified": "Đã xác minh SĐT",
"market.verified": "Xác minh"
```

---

## 수용 기준 (Done)

- [ ] `MarketDetail` 셀러 행에 **인증 배지(조건부) · 별점 · 거래건수 · 응답률(조건부)** 4가지가 노출된다
- [ ] 매너온도(°C)가 **화면에서 사라진다** (코드 잔존은 무방)
- [ ] 백엔드가 새 필드를 아직 안 내려줘도 **기본값 폴백으로 렌더 오류 없음**
- [ ] 베트남어(`vi`) 기준으로 레이블이 자연스럽다
- [ ] 빌드·ESLint 통과

## 제외 범위
- ListingCard(피드) 카드에는 이번에 신뢰 배지 미추가 (별도 티켓)
- 백엔드 review_count / avg_rating API 구현 (백엔드 티켓 별도)
- DmDetail·ReviewSheet 매너온도는 이번 범위 밖
