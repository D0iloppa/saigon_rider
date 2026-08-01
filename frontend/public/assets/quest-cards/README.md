# Quest Card Sprites

Saigon Rider 퀘스트 카드 SVG sprite. `scripts/extract_quest_card_sprites.py` 로 docs/saigon-quest-cards-*.html 에서 자동 추출.

## 사용법

```tsx
<svg viewBox="0 0 320 200">
  <use href="/assets/quest-cards/rider-sprite.svg#card-RIDING_DAILY" />
</svg>
```

## 카드 목록 (총 25개)

### RIDER (12) — `rider-sprite.svg`
- card-RIDING_DAILY / card-RIDING_WEEKLY / card-RIDING_MONTHLY
- card-COMMUNITY_DAILY / card-COMMUNITY_WEEKLY
- card-MAINT_DAILY / card-MAINT_WEEKLY
- card-MARKET_DAILY / card-MARKET_WEEKLY
- card-MIXED_DAILY
- card-DELIVERY_DAILY
- card-ONBOARDING

### SEASON (8) — `season-sprite.svg`
- card-TET_SEASON (Tết Nguyên Đán, 음력 설)
- card-HUNG_KINGS_SEASON (Giỗ Tổ Hùng Vương, 4월 시조 기념일)
- card-REUNIFICATION_SEASON (Ngày 30/4, 남부 해방일)
- card-GHOST_SEASON (Tháng 7 Âm Lịch, 음력 7월 귀신달)
- card-MID_AUTUMN_SEASON (Tết Trung Thu, 추석)
- card-RAIN_SEASON (Mùa Mưa Sài Gòn, 우기)
- card-NEW_YEAR_SEASON (Năm Mới, 양력 신년)
- card-SAIGON_BDAY_SEASON (Sinh Nhật Sài Gòn, 사이공 생일)

### MYTHIC (5) — `mythic-sprite.svg`
- card-THE_LEGEND_M (전설의 라이더)
- card-SAIGON_GHOST_M (사이공의 유령)
- card-IRON_PHOENIX_M (불사조의 귀환)
- card-STORM_KING_M (폭풍의 왕)
- card-SAIGON_ANCESTOR_M (시조의 귀환, ULTIMATE)

## viewBox

모든 카드 동일: `0 0 320 200` (16:10 가로형).

## 재생성

```bash
python3 scripts/extract_quest_card_sprites.py
```
