# 신규 아이템 부위 3종 추가 — PANTS / KNEE / WHEEL (2026-06-01)

> **Status**: ✅ DONE (2026-06-01) — 구현+라이더 프리뷰 정비(소매·다리·좌표) 완료, 배포됨. 바이크 프리뷰는 SGR-202로 분리.
> **Plane Todo**: SGR-201
> **Notion**: https://www.notion.so/3723bd6b405d814fbbb2cbb9cec23735
> **선행 참조**: 아이템 시스템 리셋 `task/active/260529_item_system_reset_task.md`, slot enum 마이그 `engine/alembic/versions/030_item_slot_enum_v7.py`, 시드 `031_item_v7_seed.py`

## 목적

장비 부위(슬롯)를 3종 추가한다. **기존 컨벤션을 그대로 따른다**: 부위당 아이템 5개, 등급 C/R/E/L/M 각 1개, 기존 컬렉션 테마(STREET_CLASSIC / NEON_SAIGON / TET_FESTIVAL / MEKONG_DELTA / LEGEND_OF_SAIGON 등) 재사용 → **신규 아이템 총 15개**.

| 탭 | 신규 슬롯 | 코드 | 의미 |
|---|---|---|---|
| 라이더 | 라이더 팬츠 | `PANTS` | 하의 (자켓 하단) |
| 라이더 | 무릎 보호대 | `KNEE` | 니가드 (무릎) |
| 바이크 | 바퀴 | `WHEEL` | 휠/타이어 |

## 영향 계층 (구현 시 빠짐없이 갱신)

### A. Engine / DB
1. **slot enum 마이그레이션** — `item_slot_enum` 에 `PANTS`, `KNEE`, `WHEEL` 값 추가. `030_item_slot_enum_v7.py` 패턴(`ALTER TYPE ... ADD VALUE IF NOT EXISTS`)으로 신규 리비전 작성.
2. **아이템 시드 마이그레이션** — 15개 아이템 카탈로그 시드. `031_item_v7_seed.py` 패턴.

### B. Frontend
3. `src/lib/items/metadata.ts` — `ItemSlot` 유니온에 3종 추가, `SLOT_VIEWBOX` 항목 추가, 카탈로그 배열에 15개 추가(itemCode 네이밍 `{SLOT}_{COLLECTION}_{R}_{NN}`).
4. `src/lib/items/slotLayout.ts` — `RIDER_LAYOUT` 에 PANTS·KNEE attach point, `BIKE_LAYOUT` 에 WHEEL attach point 추가. (slot 목록은 LAYOUT 에서 자동 파생.)
5. `src/api/inventory.ts` — `SLOT_LABELS` 에 3종 라벨 추가.
6. `src/pages/garage/Garage.tsx` — `TABS.rider` / `TABS.bike` 칩 배열에 신규 슬롯 추가(좌/우/상/하 배치 재조정), `SLOT_EMOJI` 항목 추가.
7. `src/assets/items/saigon-rider-items.svg` — 신규 심볼 15개(`item-{code}`) 추가. 기존 등급 필터(`gR`/`gE`/…) 컨벤션 유지.

## 설계 결정 필요 (신규 스레드 착수 시 확정)

- **WHEEL 렌더링**: 바이크는 전륜+후륜 2개. WHEEL 슬롯 하나가 **양쪽 바퀴에 동시 렌더**되도록 `points` 2개(MIRROR 의 pair 패턴, base 휠 cx82/cx315, r34)로 구성할지 — 권장: pair 2-point.
- **라이더 칩 레이아웃**: 현재 rider left=[HELMET,JACKET,GLOVES] / right=[EYEWEAR,NAME,BOOTS]. PANTS·KNEE 2개 추가 시 좌우 균형 재배치 필요(좌3/우3 → 좌4/우4 등).
- **PANTS/KNEE attach 좌표**: 라이더 베이스(viewBox `0 0 300 400`) 기준. JACKET(80,82,140,140) 하단·BOOTS(y340) 상단 사이. 착용 시각검증 반복(SGR-200 방식: 좌표 수정 → frontend 재빌드 → 스크린샷).

## 검증

- [ ] 마이그레이션 적용 후 enum/카탈로그에 3슬롯×5아이템 존재
- [ ] 게러지 라이더 탭에 PANTS·KNEE 칩, 바이크 탭에 WHEEL 칩 표시
- [ ] 각 신규 아이템 착용 시 프리뷰 합성에 자연스럽게 렌더
- [ ] 인벤토리/상점/가차에서 신규 슬롯 아이템 정상 노출

## 제약

- 기존 5개/슬롯·등급 분포·컬렉션 테마 컨벤션 준수(임의 확장 금지).
- 좌표 튜닝은 시각검증 반복(프리뷰 HTML 불필요 — 바로 frontend 빌드).
