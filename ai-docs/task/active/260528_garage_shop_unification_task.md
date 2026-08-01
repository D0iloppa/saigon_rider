# 상점 → 개러지 딥링크 연계

> **상태**: 🟢 코드 변경 완료 — 사용자 수동 검증 대기 (2026-05-28)
> **착수일**: 2026-05-28
> **Task ID**: `260528_garage_shop_unification`
> **선행 대화**: 2026-05-28 기획 세션 → 사용자 결정으로 SVG 합성·자동 장착·확인 모달 등 전 범위 **DROPPED**, 딥링크만 남김
> **관련 코드**:
> - `frontend/src/pages/shop/ItemDetail.tsx` (구매 후 CTA 전환)
> - `frontend/src/pages/garage/Garage.tsx` (이미 `?slot=` 쿼리 수신 → 탭/슬롯 자동 선택 구현 완료)
> - `frontend/src/locales/{ko,en,vi}/translation.json` (`itemDetail.*` 키)

---

## 0. 스코프 (축소 후)

**해결할 것 1개만**: 상점에서 구매한 직후, 사용자가 개러지의 정확한 슬롯으로 한 번에 진입할 수 있게 한다.

**해결하지 않을 것** (의도적 DROP — 별도 티켓이 필요하면 신규로 분리):
- SVG 레이어 합성 / 베이스 실루엣 자산 정비
- `ItemDefinition` 마이그레이션 (svg_content_id, 앵커 좌표 등)
- 자동 equip / 슬롯 점유 시 확인 모달
- 공용 `EquippedPreview` / `ReplaceConfirmDialog` 컴포넌트
- 개러지 인라인 프리뷰 리팩토링
- 이펙트 슬롯 동적 자산

## 1. 의사결정 기록

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D1 | 구매와 장착의 연결 | **딥링크만** (자동 장착 X, 확인 모달 X, 합성 프리뷰 X) | 사용자 결정 — 최소 변경으로 "재방문 마찰"만 해소 |
| D2 | 진입 경로 | 구매 성공 후 ItemDetail CTA 가 `/garage?slot={item_slot}` 로 이동 | Garage 가 이미 쿼리 파라미터 수신 (`Garage.tsx:149-155`) → 신규 라우팅 불필요 |
| D3 | 백엔드 변경 | **없음** | `/v1/shop/purchase` 그대로, 장착은 사용자가 개러지에서 수동 |
| D4 | 자산 작업 | **없음** | SVG/PNG 합성은 본 티켓 범위 밖 |

## 2. 작업 계획 (목표·검증 형태)

### Step 1. ItemDetail CTA 전환 (구매 후 → 개러지로)
- [x] `frontend/src/pages/shop/ItemDetail.tsx` 구매 성공 분기에서 CTA 라벨/액션 교체
  - 미구매 상태: 기존 "구매" 버튼 유지
  - 구매 완료(`is_owned === true`) 상태: 버튼이 "개러지에서 착용하기" 로 전환 → 클릭 시 `navigate('/garage?slot=' + item.item_slot)`
- [x] `disabled` 처리 제거 (구매 완료에서 비활성 → 활성 CTA 로 전환되어야 함)
- [x] 시각적으로 구매 완료 상태가 구분되도록 기존 스타일 활용 (`btnBuyDisabled` 대신 정상 버튼 + 다른 라벨)

**검증**:
- 새 아이템 구매 → 토스트 표시 후 CTA 가 "개러지에서 착용하기" 로 변함
- CTA 클릭 → `/garage?slot=<해당 슬롯>` 로 이동
- 개러지 진입 시 해당 카테고리 탭 자동 선택 + 슬롯 자동 활성 + 인벤토리에서 방금 산 아이템 노출

### Step 2. i18n 키 추가
- [x] `itemDetail.equip_in_garage` 키를 ko / en / vi 에 추가
  - ko: "개러지에서 착용하기"
  - en: "Equip in Garage"
  - vi: "Trang bị tại Garage"

**검증**: 3개 언어에서 라벨이 의도대로 표시됨

### Step 3. 회귀 확인
- [x] 이미 보유한(`is_owned: true`) 아이템 ItemDetail 진입 시 → 첫 진입부터 "개러지에서 착용하기" CTA 보이는지 확인 (의도된 동작)
- [x] 보유 표시(`itemDetail.owned`) 의 다른 사용처 (`priceMain` 영역) 그대로 유지되는지 확인
- [x] Garage `?slot=` 핸들링 회귀 없는지 (`Garage.tsx:149-155`)

**검증**: 위 항목 수동 확인 후 이상 없음

## 3. 위험 / 회귀 포인트

- **보유 아이템 UX 변경**: 기존엔 "구매 완료" 비활성 버튼이었으나, 이제 "개러지에서 착용하기" 활성 버튼이 됨. 의도된 변경 — 별도 보유 표시는 `priceMain` 영역에 그대로 유지
- **`slotLabel` 매핑 누락 슬롯**: `item_slot` 이 Garage `TABS` 어디에도 없으면 진입 시 `currentTab='rider'` 기본 폴백되고 슬롯이 비활성. 현재 23개 슬롯 모두 매핑됨 (`Garage.tsx:56-115`) — 신규 슬롯 추가 시 동기화 필요 (별도 사안)

## 4. 다음 세션 진입 가이드

1. 본 문서 §2 Step 1–3 순차 진행
2. 완료 시 `[ ]` → `[x]`, 상태를 `🟢 DONE` 으로 변경
3. `ai-docs/context/current.md` 반영 후 `/code-review medium` 게이트 통과 시 push
