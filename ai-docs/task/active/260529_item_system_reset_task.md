# 아이템 시스템 리셋 — 새 카탈로그 구축 (2026-05-29)

> **Feature**: #145 `[item] 아이템 시스템 리셋`  
> **Status**: 🔧 IN_PROGRESS  
> **Plane Todos**: #146 ~ #159  
> **Notion**: https://www.notion.so/36f3bd6b405d8116ad8fd9fde08f7889  
> **소스 HTML**: `_tmp/html/saigon-rider-v7-*.html` (5파일)  
> **파싱 JSON**: `_tmp/html/v7_catalog.json` (127항목)

## 목적

기존 251개 아이템을 전부 제거하고 새로운 카탈로그를 처음부터 구축한다.
슬롯 재정의(헬멧·자켓 추가), 새 컬렉션 테마, 부위별 5개 축소, 등급 C/R/E/L/M 유지.

---

## Phase 1 — 설계 ✅ DONE

| # | 서브태스크 | 상태 |
|---|---|---|
| #146 | 슬롯 목록 재정의 | ✅ DONE |
| #147 | 컬렉션 테마 구성 | ✅ DONE |
| #148 | 아이템 카탈로그 확정 | ✅ DONE |

### 확정 슬롯 (25종, 베이스 2 제외)

| 구분 | 슬롯 | HTML ID prefix | 기존 대비 |
|---|---|---|---|
| **라이더 장비** | HELMET | HELMET_ | **신규** |
| | JACKET | JACKET_ | **신규** |
| | GLOVES | GLOVES_ | 유지 |
| | EYEWEAR | EYEWEAR_ | 유지 |
| | BOOTS | BOOTS_ | 유지 |
| **바이크 파츠** | BODY | BODY_ | ← MOTORCYCLE_BODY |
| | ENGINE | ENGINE_ | ← ENGINE_COVER |
| | SEAT | SEAT_ | 유지 |
| | STICKER | STICKER_ | 유지 |
| | HANDLE | HANDLE_ | ← HANDLEBAR |
| | MIRROR | MIRROR_ | 유지 |
| | LIGHT | LIGHT_ | ← HEADLIGHT |
| | TAIL | TAIL_ | ← TAIL_LIGHT |
| | NUMBER | NUMBER_ | 유지 |
| **프로필** | NAME | NAME_ | ← NAMEPLATE |
| | RANK | RANK_ | ← RANK_CARD |
| | FRAME | FRAME_ | 유지 |
| | TITLE | TITLE_ | 유지 |
| | BACKDROP | BACKDROP_ | 유지 |
| **이펙트** | TRAIL | TRAIL_ | 유지 |
| | START | START_ | ← START_ANIM |
| | HORN | HORN_ | 유지 |
| **소셜** | BANNER | BANNER_ | 유지 |
| | EMOTE | EMOTE_ | 유지 |
| | PET | PET_ | 유지 |

### 확정 컬렉션 (7종, 기존과 동일 테마명)

| 컬렉션 | 컬러 | 컨셉 |
|---|---|---|
| STREET_CLASSIC | #6B7280 (grey) | 일상/기본 |
| DELIVERY_HUSTLE | #FFD400 (yellow) | 배달/하이비스 |
| NEON_SAIGON | #FF6B00 (orange) | 사이버펑크/네온 |
| MEKONG_DELTA | #0E7C66 (green) | 자연/전원 |
| SAIGON_GHOST | #3D1E6D (purple) | 다크/팬텀 |
| TET_FESTIVAL | #C8102E (red) | 설날/전통 |
| LEGEND_OF_SAIGON | #FFB400 (gold) | 전설/프리미엄 |

### 아이템 분포 (125개 = 25슬롯 × 5등급)

각 슬롯에 C/R/E/L/M 1개씩, 서로 다른 컬렉션에서 배분.
batch4(이펙트/소셜/프로필 50개)는 이름 TBD — SVG symbol ID는 확정.

### 등급별 가격 (기존 체계 유지)

| 등급 | shop_price_gp | shop_price_gc | is_shop_visible |
|---|---|---|---|
| C | 300 | — | true |
| R | 2,000 | — | true |
| E | 10,000 | — | true |
| L | 35,000 | 100 | true |
| M | — | 500 | false (가챠 전용) |

### ID 매핑 변경표 (기존 → v7)

| v6 슬롯 Enum | v7 슬롯 Enum | 비고 |
|---|---|---|
| MOTORCYCLE_BODY | BODY | 축약 |
| ENGINE_COVER | ENGINE | 축약 |
| HANDLEBAR | HANDLE | 축약 |
| HEADLIGHT | LIGHT | 축약 |
| TAIL_LIGHT | TAIL | 축약 |
| NAMEPLATE | NAME | 축약 |
| RANK_CARD | RANK | 축약 |
| START_ANIM | START | 축약 |
| (없음) | HELMET | 신규 |
| (없음) | JACKET | 신규 |

### 유저 데이터 정리 (2026-05-29 실행 완료)

기존 유저 보유/착용 데이터 TRUNCATE 완료:
user_equipment, user_item, item_acquisition_log, daily_featured_item,
user_gacha_pity, gacha_pull_log, lootbox_drop_log, user_inventory_box → 모두 0 rows

---

## Phase 2 — DB/Seed (P2)

| # | 서브태스크 | 상태 | 산출물 |
|---|---|---|---|
| #149 | ItemSlotEnum 갱신 | TODO | engine/app/models.py |
| #150 | 기존 item 데이터 정리 마이그레이션 | TODO | sre0XX migration |
| #151 | 새 seed SQL 생성 | TODO | sre-item-seed.sql |
| #152 | lootbox·gacha·가격 갱신 | TODO | seed + config |

## Phase 3 — SVG 에셋 (P3)

| # | 서브태스크 | 상태 | 산출물 |
|---|---|---|---|
| #153 | SVG 수령 + combined sprite 재생성 | TODO | saigon-rider-items.svg |
| #154 | asset_uri 매핑 + 시각 검증 | TODO | dev-test 카탈로그 |

## Phase 4 — 프론트엔드 통합 (P4)

| # | 서브태스크 | 상태 | 산출물 |
|---|---|---|---|
| #155 | 프론트 컴포넌트 호환성 확인 | TODO | ItemSvgRenderer, EquipPreview |
| #156 | i18n 번역 갱신 (ko/en/vi) | TODO | translation.json |
| #157 | E2E 흐름 테스트 | TODO | 상점→인벤토리→착용 |

## Phase 5 — 효과 시스템 (P5)

| # | 서브태스크 | 상태 | 산출물 |
|---|---|---|---|
| #158 | 효과 스키마 설계 + DB 반영 | TODO | 효과 모델 |
| #159 | 개러지 착용 프리뷰 시각 구현 | TODO | EquipPreview 갱신 |

## Phase 6 — 착용 합성 프리뷰 (P6) ✅ DONE (2026-05-31, iOS 확인)

> **Notion 상세 지침**: https://www.notion.so/36f3bd6b405d8128bb9ee79a8c344df1
> **Plane Issue**: SGR-173 (SGR-145 sub-issue)
> **목적**: 아이템 착용 시 SVG symbol들을 베이스 위에 레이어 합성하여 Garage 화면에서 실시간 프리뷰

| # | 서브태스크 | 상태 | 산출물 |
|---|---|---|---|
| — | SVG sprite defs 통합 (필터/그래디언트) | ✅ DONE | saigon-rider-items.svg defs 섹션 |
| — | 슬롯→좌표 매핑 데이터 정의 | ✅ DONE | `lib/items/slotLayout.ts` |
| — | EquipComposite 컴포넌트 (라이더) | ✅ DONE | `components/equip/RiderComposite.tsx` |
| — | EquipComposite 컴포넌트 (바이크) | ✅ DONE | `components/equip/BikeComposite.tsx` |
| — | 다크/화이트모드 베이스 대응 | ⏸ 보류 | 라이트모드 정상 렌더라 비차단 |
| — | Garage 페이지 통합 | ✅ DONE | `pages/garage/Garage.tsx` 반영 |
| — | 시각 검증 (등급별 필터·글로우) | 🟡 부분 | 위치/노출 검증 완료, composite 글로우 미적용 |

> **2026-05-31 완료 메모**: 베이스 SVG 개발용 가이드박스 제거, slotLayout 좌표 실루엣 정렬(HELMET 축소·BOOTS 발위치+확대·BIKE LIGHT/MIRROR/ENGINE/TAIL). 동반으로 ItemSvgRenderer viewBox 정규화(상점 아이콘 미노출 버그)·SpriteProvider display:none 제거(iOS WebKit gradient 미해석 버그) 해결. 잔여: composite 등급별 글로우 필터 미적용(비차단).

### 합성 아키텍처 요약

**2개 캔버스**: 라이더(300×400 세로) + 바이크(400×200 가로)

**라이더 Attachment Points**:
- HELMET: (100, 0, 100×100)
- JACKET: (90, 90, 120×120)
- EYEWEAR: (110, 48, 80×20) — scale(0.8, 0.2)
- NAME: (110, 125, 80×30) — scale(0.8, 0.3)
- GLOVES: L(60,220) R(200,220) 40×40 — scale(0.4)
- BOOTS: L(100,362) R(160,362) 40×25 — scale(0.4, 0.25)

**바이크 Attachment Points**:
- BODY(80,60,240×80), ENGINE(150,110,60×40), SEAT(200,70,80×30)
- STICKER(160,90,80×40), HANDLE(100,60,60×20)
- MIRROR L(107,42,25×25) R(132,42,25×25 scaleX-1)
- LIGHT(65,80,40×40), TAIL(325,95,30×30), NUMBER(295,147,50×26)

**batch4 (이펙트/소셜/프로필 10슬롯)**: 베이스 합성 없이 독립 100×100 아이콘

**레이어 순서 (뒤→앞)**: JACKET → NAME → EYEWEAR → GLOVES → BOOTS → HELMET

**다크모드 주의**: 소스 HTML이 다크배경 전제 — 베이스 실루엣·stroke 색상 반전 또는 CSS 변수 분기 필요

---

## 이전 태스크와의 관계

- `260522_item_catalog_replace_task.md` (DONE) — 이 태스크의 결과물(251개)을 전부 교체하는 작업
- TODO A-2 (효과 정의), A-3 (착용 프리뷰), A-4 (부위별 5개 축소) 통합

## 제약/결정사항

- 등급 체계 C/R/E/L/M 5단계 유지
- SVG 에셋은 사용자가 HTML로 제공 (`_tmp/html/saigon-rider-v7-*.html`)
- 다크모드 기반 HTML → 화이트 색상으로 인식하고 등록
- Phase 순차 진행
