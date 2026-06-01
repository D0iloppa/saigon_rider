# Quest Card Image Generation Prompts

> 현재 퀘스트 카드는 `frontend/public/assets/quest-cards/*.svg` 의 인라인 SVG sprite (vector illustration).
> 이를 **AI 이미지 생성 결과물**로 교체하기 위한 프롬프트 작업 시트.
> 카드별로 프롬프트를 작성 → 생성 → 결과 이미지를 `<symbol id="card-…">` 자리에 교환.

## 공통 사양

- **viewBox / 비율**: `0 0 320 200` (16:10 가로형) — 생성 시 동일 비율 유지
- **출력 포맷**: PNG (또는 WebP), 최소 640×400 (2x), 권장 1280×800 (4x)
- **스타일 기조** (현 SVG 톤): neon glow, holographic gradient, cyber-vietnam, dark background, accent color per tier
- **공통 negative**: `text, watermark, logo, signature, low-res, jpeg artifacts, blurry, deformed`

## 진행 상태 표기

각 카드는 3 단계 체크박스로 진행 상태를 추적:

- `[P]` Prompt 작성 완료
- `[G]` Generated (이미지 생성 완료)
- `[R]` Replaced (sprite → 생성 이미지로 교체 완료)

예: `- [x] [x] [ ]` = 프롬프트·생성 완료, 교체 미완

## 교환 대상

### RIDER (12) — `rider-sprite.svg`

- [x] [x] [x] `card-RIDING_DAILY` — 데일리 라이딩
- [x] [x] [x] `card-RIDING_WEEKLY` — 위클리 라이딩
- [x] [x] [x] `card-RIDING_MONTHLY` — 먼슬리 라이딩
- [x] [x] [x] `card-COMMUNITY_DAILY` — 데일리 커뮤니티
- [x] [x] [x] `card-COMMUNITY_WEEKLY` — 위클리 커뮤니티
- [x] [x] [x] `card-MAINT_DAILY` — 데일리 정비
- [x] [x] [x] `card-MAINT_WEEKLY` — 위클리 정비
- [x] [x] [x] `card-MARKET_DAILY` — 데일리 마켓
- [x] [x] [x] `card-MARKET_WEEKLY` — 위클리 마켓
- [x] [x] [x] `card-MIXED_DAILY` — 데일리 믹스
- [x] [x] [x] `card-DELIVERY_DAILY` — 데일리 배달
- [x] [x] [x] `card-ONBOARDING` — 온보딩

### SEASON (8) — `season-sprite.svg`

- [x] [x] [x] `card-TET_SEASON` — 음력 설 (Tết Nguyên Đán)
- [x] [x] [x] `card-HUNG_KINGS_SEASON` — 흥왕 기념일 (Giỗ Tổ Hùng Vương)
- [x] [x] [x] `card-REUNIFICATION_SEASON` — 남부 해방일 (Ngày 30/4)
- [x] [x] [x] `card-GHOST_SEASON` — 귀신달 (Tháng 7 Âm Lịch)
- [x] [x] [x] `card-MID_AUTUMN_SEASON` — 추석 (Tết Trung Thu)
- [x] [x] [x] `card-RAIN_SEASON` — 우기 (Mùa Mưa Sài Gòn)
- [x] [x] [x] `card-NEW_YEAR_SEASON` — 양력 신년 (Năm Mới)
- [x] [x] [x] `card-SAIGON_BDAY_SEASON` — 사이공 생일 (Sinh Nhật Sài Gòn)

### MYTHIC (5) — `mythic-sprite.svg`

- [x] [x] [x] `card-THE_LEGEND_M` — 전설의 라이더
- [x] [x] [x] `card-SAIGON_GHOST_M` — 사이공의 유령
- [x] [x] [x] `card-IRON_PHOENIX_M` — 불사조의 귀환
- [x] [x] [x] `card-STORM_KING_M` — 폭풍의 왕
- [x] [x] [x] `card-SAIGON_ANCESTOR_M` — 시조의 귀환 (ULTIMATE)

## 프롬프트 작성 슬롯

카드별 프롬프트는 아래 형식으로 누적:

```
### card-<SYMBOL_ID>
**Prompt:**
<프롬프트 본문>

**Negative:** (공통 negative 외 추가분이 있을 때만)
<추가 negative>

**Seed / Params:** (선택)
<seed, sampler, steps 등>

**Generated:** `contents/system/quest-cards/<symbol-id>.png` (imgproxy 경유, contents 시드 047)
```

<!-- 프롬프트 추가 시 여기 아래에 카드별 섹션을 작성 -->

### card-RIDING_DAILY
**Prompt:**
A motorbike rider in black cyberpunk gear speeding on a futuristic city street in Saigon at night, skyscraper silhouettes, glowing orange-pink holographic neon sky, neon glow trails, cyberpunk style, dark background, RPG game card art, 16:10 aspect ratio.

**Generated:** `contents/system/quest-cards/card-RIDING_DAILY.png`

### card-RIDING_WEEKLY
**Prompt:**
A motorbike rider speeding on a futuristic glowing neon cyan map route grid, holographic GPS navigation path with orange glowing waypoints, neon glow, cyberpunk Saigon theme, dark background, RPG card illustration style, 16:10 aspect ratio.

**Generated:** `contents/system/quest-cards/card-RIDING_WEEKLY.png`

### card-RIDING_MONTHLY
**Prompt:**
A futuristic golden holographic trophy cup emblem floating in the air, glowing golden neon particles, dark cyberpunk background with a silhouette of a motorcycle rider in the distance, gold and amber accent colors, cyberpunk Saigon vibe, dark RPG card game art, 16:10 aspect ratio.

**Generated:** `contents/system/quest-cards/card-RIDING_MONTHLY.png`

## 생성 결과 (2026-05-28 일괄 재생성)

**모델:** `gemini-2.5-flash-image` (Nano Banana, GA)
**스크립트:** `scripts/generate_quest_card_images.py`
**Tone anchor:** `RIDING_DAILY` (첫 생성 후 reference 로 후속 카드에 전달)
**누적 사용량 로그:** `contents/system/quest-cards/_usage.json`

### 토큰 사용량 (25/25 성공)

| Card | bytes | sec | in | out | total |
|---|---:|---:|---:|---:|---:|
| RIDING_DAILY | 1,849,098 | 7.1 | 82 | 1290 | 1372 |
| RIDING_WEEKLY | 2,720,081 | 14.8 | 335 | 1290 | 1625 |
| RIDING_MONTHLY | 1,438,018 | 15.4 | 339 | 1316 | 1655 |
| COMMUNITY_DAILY | 2,588,145 | 14.4 | 340 | 1334 | 1674 |
| COMMUNITY_WEEKLY | 2,585,386 | 14.6 | 336 | 1290 | 1626 |
| MAINT_DAILY | 2,479,088 | 12.3 | 341 | 1290 | 1631 |
| MAINT_WEEKLY | 2,237,429 | 14.2 | 336 | 1290 | 1626 |
| MARKET_DAILY | 2,560,226 | 11.6 | 334 | 1304 | 1638 |
| MARKET_WEEKLY | 2,688,996 | 16.8 | 332 | 1290 | 1622 |
| MIXED_DAILY | 2,633,227 | 13.9 | 348 | 1290 | 1638 |
| DELIVERY_DAILY | 2,561,156 | 18.8 | 343 | 1308 | 1651 |
| ONBOARDING | 2,683,802 | 12.4 | 341 | 1306 | 1647 |
| TET_SEASON | 2,709,083 | 10.9 | 349 | 1303 | 1652 |
| HUNG_KINGS_SEASON | 2,542,892 | 10.9 | 341 | 1290 | 1631 |
| REUNIFICATION_SEASON | 2,602,351 | 12.5 | 347 | 1290 | 1637 |
| GHOST_SEASON | 2,551,248 | 13.0 | 343 | 1290 | 1633 |
| MID_AUTUMN_SEASON | 2,708,102 | 11.8 | 341 | 1290 | 1631 |
| RAIN_SEASON | 2,601,979 | 11.4 | 346 | 1316 | 1662 |
| NEW_YEAR_SEASON | 2,490,233 | 11.4 | 348 | 1304 | 1652 |
| SAIGON_BDAY_SEASON | 2,625,854 | 14.2 | 342 | 1290 | 1632 |
| THE_LEGEND_M | 2,647,285 | 62.0 | 354 | 1290 | 1644 |
| SAIGON_GHOST_M | 2,281,010 | 12.0 | 340 | 1318 | 1658 |
| IRON_PHOENIX_M | 2,735,644 | 12.7 | 348 | 1290 | 1638 |
| STORM_KING_M | 2,732,269 | 13.1 | 340 | 1318 | 1658 |
| SAIGON_ANCESTOR_M | 2,676,133 | 10.6 | 348 | 1290 | 1638 |
| **합계 (25)** | **62,036,655** | **361.6** | **8,294** | **32,477** | **40,771** |

**예상 비용:** output 이미지 토큰 ~$30/1M 기준 약 **$0.97** (≈ ₩1,300)

## 작업 절차

1. 위 목록의 각 카드별 **프롬프트** 작성 → `[P]` 체크
2. 외부 이미지 생성 도구 (Midjourney/DALL·E/SD 등) 로 생성 → `[G]` 체크
3. 결과물을 `contents/system/quest-cards/<symbol-id>.png` 로 저장 (imgproxy 볼륨 `./contents:/data:ro`)
4. `database/init/047_quest_card_contents_seed.sql` 에 INSERT 추가 (`owner_type='system'`, `file_path='system/quest-cards/<symbol-id>.png'`)
5. DB 시드 적용 후 `GET /api/bff/quest-cards/images` 에서 cardCode 가 반환되는지 확인 → `[R]` 체크
   - 프론트(`QuestCard.tsx`)는 URL 존재 시 `<AppImage>`, 없으면 sprite 폴백.
5. sprite SVG 파일은 폴백/레거시로 유지하거나, 모든 교체 완료 후 제거

## 참고

- 현 sprite 추출 스크립트: `scripts/extract_quest_card_sprites.py`
- 원본 HTML 디자인: `docs/saigon-quest-cards-*.html`
- README: `frontend/public/assets/quest-cards/README.md`
