# 아이템 카탈로그 전면 교체 (2026-05-22)

> Status: ✅ DONE (마이그레이션 sre025 적용 + 프론트 재빌드 완료, DB 251개 검증)  
> Source: `_tmp/asset/saigon-rider-*-catalog.html` (8 카탈로그) + sibling `*-v5.svg` 스프라이트

## 목적
기존 213개 아이템 시드를 폐기하고, _tmp/asset 의 새 카탈로그 8종(**실측 251개**) 으로 전면 교체.

> ⚠️ 문서 초안의 "291"·등급합 "281"은 오기. 8개 카탈로그 원본 실측 합계는 **251개**
> (bikes 25 / custom 33 / effects 33 / gear 38 / parts 33 / parts2 23 / profile 33 / social 33).
> 분포 테이블(아래)의 행 합계도 251과 일치.

## 범위

### 슬롯 변경
- **제거**: HELMET, JACKET, BODY_PAINT, WHEEL, EXHAUST, DECAL (6종)
- **추가**: MOTORCYCLE_BODY, SEAT, STICKER, RANK_CARD, HANDLEBAR, TAIL_LIGHT, ENGINE_COVER, EMOTE, BANNER, PET (10종)
- **유지**: GLOVES, BOOTS, EYEWEAR, NAMEPLATE, HEADLIGHT, MIRROR, NUMBER, FRAME, BACKDROP, TITLE, TRAIL, HORN, START_ANIM (13종)
- **총 23 슬롯**

### 아이템 분포
| Catalog | Slot(s) | Count | Sprite |
|---|---|---|---|
| bikes | MOTORCYCLE_BODY | 25 | saigon-rider-bikes-v5.svg |
| custom | SEAT, STICKER, RANK_CARD | 33 | saigon-rider-custom-v5.svg |
| effects | TRAIL, HORN, START_ANIM | 33 | saigon-rider-effects-v5.svg |
| gear | GLOVES, BOOTS, EYEWEAR, NAMEPLATE | 38 | saigon-rider-gear-v5.svg |
| parts | HANDLEBAR, TAIL_LIGHT, ENGINE_COVER | 33 | saigon-rider-parts-v5.svg |
| parts2 | HEADLIGHT, MIRROR, NUMBER | 23 | saigon-rider-parts2-v5.svg |
| profile | FRAME, BACKDROP, TITLE | 33 | saigon-rider-profile-v5.svg |
| social | EMOTE, BANNER, PET | 33 | saigon-rider-social-v5.svg |
| **TOTAL** | 23 slots | **251** | 8 sprites |

등급 분포 (실측): C 91 · R 69 · E 47 · L 24 · M 20  
컬렉션 7종 (기존과 동일): STREET_CLASSIC, NEON_SAIGON, MEKONG_DELTA, DELIVERY_HUSTLE, TET_FESTIVAL, SAIGON_GHOST, LEGEND_OF_SAIGON
(소스 ID의 `GHOST_SAIGON`→SAIGON_GHOST, `CIRCUIT_RIDER`→NEON_SAIGON 정규화 적용)

### 등급별 가격/플래그 규칙
| 등급 | shop_price_gp | shop_price_gc | is_shop_visible | season_lock |
|---|---|---|---|---|
| C | 300 | NULL | TRUE | FALSE |
| R | 2000 | NULL | TRUE | FALSE |
| E | 10000 | NULL | TRUE | FALSE |
| L | 35000 | 200 | FALSE | TET_FESTIVAL 만 TRUE (TET_S1) |
| M | NULL | 500 | FALSE | FALSE |

`asset_uri` = `sprite://{sprite-filename}#item-{ITEM_CODE}`

> **표시명 i18n 결정**: `item_definition.display_name` 컬럼엔 **item_code** 를 저장하고,
> 실제 표시명은 프론트 i18n `items.<code>` 에서 관리(en/ko/vi 동일 영문 큐레이션명, ko/vi 번역 TODO).
> custom/effects/profile 카탈로그 99개는 원본에 이름이 없어 큐레이션 작성 (`_tmp/asset/_curated_names.json`).

## 작업 단계 (전부 ✅ 완료)
1. ✅ `engine/app/enums.py` — ItemSlotEnum 23종으로 교체
2. ✅ Alembic **sre025** (`025_item_catalog_replace.py`) — TRUNCATE item_definition CASCADE → ENUM swap → 컬렉션7 + 251 INSERT (DB 적용·검증 완료, 023/024는 기존 마이그레이션이라 025로 재배치)
3. ✅ `_tmp/sre-upgrade/sre-item-seed.sql` 재생성 (백업 `.bak`, 룻박스 섹션 보존)
4. ✅ 프론트 8개 v5 스프라이트 → 단일 `frontend/src/assets/items/saigon-rider-items.svg` 병합(251 symbol), `ItemSvgRenderer` 항상 `#item-{code}` 참조로 단순화
5. ✅ `frontend/src/lib/items/metadata.ts` 전면 교체(251종, name 제거·sprite 추가) + i18n `items` 네임스페이스 주입(en/ko/vi 251키) + `<ItemName>` 컴포넌트로 6개 화면 배선
6. ✅ `dev-test/item-catalog/index.html` + 8 스프라이트 갱신(nginx 서빙 경로 root 동기화, frontend/public 동일)
7. ✅ tsc 0 err / eslint 0 err / ruff(신규 파일) 통과 · pytest는 실행 환경 부재로 미실행
8. ✅ context current.md DONE 마킹

### 생성 스크립트 (재현용, `_tmp/asset/`)
- `_extract_items.py` → `_extracted_items.json` (8 카탈로그 파싱·정규화)
- `_curated_names.json` (무명 99개 큐레이션)
- `_gen_artifacts.py` → `out/{migration_items.sql, metadata_items.ts, i18n_items.json}` + `_items_final.json`

## 보류 (별도 작업)
- 시즌패스 보상 트랙 (_REWARD_SEED) 재구성
- 가챠 컬렉션 필터(NEON_BOX 등) 실데이터 검증 — 025가 loot_box_drop 을 CASCADE 로 비웠으므로 드롭 재시드 필요
- ko/vi 아이템명 실제 번역 (현재 en값 복제)
- 프론트 mock 데이터(api/shop·inventory·gacha)·Garage 장착탭·SLOT_LABEL 맵의 구 슬롯 잔재 정리
