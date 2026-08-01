# 게러지 '바이크' 탭 프리뷰 레이아웃 정비 (2026-06-01)

> **Status**: ✅ DONE (2026-06-01)
> **Plane Todo**: SGR-200 (DONE)
> **Notion**: https://www.notion.so/3723bd6b405d8138ade9fbde18e065c3
> **관련**: current.md A-3 `아이템 착용시 개러지에 착용 효과 보여주기` (본 건은 *배치 보정*으로 별개)
> **대상 파일**:
> - `frontend/src/pages/garage/Garage.tsx` (TABS.bike 슬롯 칩 배열)
> - `frontend/src/lib/items/slotLayout.ts` (BIKE_LAYOUT 착용 좌표)

## 목적

게러지 '바이크' 탭에서 두 가지 레이아웃 이슈를 보정한다.

---

## 이슈 1 — 슬롯 칩 배치 순서 (Garage.tsx)

현재 bike 탭 슬롯 칩 배치가 좌→우/위→아래 순서와 어긋남.

| | 현재 | 변경 |
|---|---|---|
| 우측(right) | `[ENGINE, STICKER]` | `[NUMBER, TAIL]` |
| 하단(bottom) | `[TAIL, NUMBER]` | `[ENGINE, STICKER]` |

→ 검증: 게러지 바이크 탭에서 하단 행이 `[엔진, 스티커]`, 우측 열이 `[넘버, 테일]` 순으로 표시.

## 이슈 2 — 착용 프리뷰 위치 (slotLayout.ts BIKE_LAYOUT)

바이크 베이스(viewBox `0 0 400 200`) 위 장비 attach 좌표가 부적절. 시각 튜닝 필요.

| 슬롯 | 현재 좌표(x,y,w,h) | 문제 / 방향 |
|---|---|---|
| NUMBER | 295,147,50,26 | 바퀴 위에 올라가 있음 → 번호판 위치 재배치 |
| TAIL | 343,99,30,30 | TAIL=muffler 기준 위치 재조정 |
| ENGINE | 165,118,60,40 | 살짝 위로 |
| SEAT | 200,70,80,30 | 위로 |
| STICKER | 160,90,80,40 | 위치 재조정 |

→ 검증: 게러지 바이크 탭에서 각 장비 착용 시 베이스 바이크의 해당 부위에 자연스럽게 겹쳐 표시 (브라우저 시각검증).

---

## 이슈 3 — 부위 미선택 시 전체 아이템 표시 (Garage.tsx, 공통)

부위(슬롯) 선택 전에는 그리드에 placeholder만 떠 보유 아이템을 알 수 없음.
→ `activeSlot === null`일 때 해당 탭(rider/bike/effect)의 **전 슬롯 아이템을 모두 표시**.

- `displayItems` 메모: activeSlot 있으면 해당 슬롯, 없으면 `tabSlotKeys` 전체.
- 그리드 타이틀: activeSlot ? slotLabel : `equipPreview.all_items` (신규 i18n ko/en/vi).
- 보유 0개일 때만 기존 `select_slot` placeholder 폴백.

→ 검증: 게러지 진입 직후(부위 미선택) 라이더/바이크/이펙트 각 탭에서 보유 아이템 전체가 그리드에 표시.

## 제약

- Surgical: 위 두 파일의 해당 라인만 수정. 인접 코드/스타일 손대지 않음.
- 이슈 2는 좌표 수치 튜닝이므로 실제 렌더 확인하며 반복 조정.
