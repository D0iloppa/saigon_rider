# 동네마켓 DM 가격제안하기 — 2026-07-06

> SoT. 대표 피드백(2026-07-06, 당근마켓 참조 지시)에 따른 작업 패키지.
> 레퍼런스 스크린샷: `~/workspace/w_dev/saigon_rider/_tmp/image copy 40.png` (당근 가격제안 화면 — 상단 상품카드 + 금액 입력 + 빠른 감액 칩[-2만/-3만/-5만] + 제안하기 CTA).
> 기획 근거: [`260616_marketplace_pivot_planning_task.md`](260616_marketplace_pivot_planning_task.md) §10-B "채팅: 가격 제안 → 약속(시간·장소)" — 약속잡기(SGR-287)는 완료, 가격제안만 미착수.

## 목적

구매자가 매물에 대해 **가격제안을 보내고, 판매자가 채팅 안에서 수락/거절**할 수 있게 한다. 협의는 전부 DM 안에서 이뤄진다(약속잡기와 동일 원칙).

## 현황 (2026-07-06 조사 완료 — 재조사 불필요)

- **가격제안은 한 번도 구현된 적 없음.** 존재하는 것은 매물의 `is_negotiable` 불리언뿐 (`models.py:390`, `MarketCreate.tsx` "가격 제안 받기" 토글, `MarketDetail.tsx` "가격 제안 가능" 뱃지).
- **미러할 기존 패턴 = 약속잡기(SGR-287)**: `marketplace_appointments` 테이블 + `POST /market/appointments`·`PATCH .../accept|complete|cancel` (`market.py:873-1026`) + DmMessage `message_type='appointment'` + `dm.py:238-256 _appt_for()`로 `DmMessageOut.appointment` 임베드 + DmDetail 내 메시지 카드/액션 버튼.
- **DM 메시지 모델은 확장 준비됨**: `DmMessage.message_type`(자유 문자열) + `meta`(JSONB). conversation에 `context_type/context_id`로 매물 이미 연결, DmDetail 상단에 매물 컨텍스트 카드 표시 중.
- **MessageComposer**(커밋 `8c69a7c`)의 `[+]` 메뉴(`ComposerMenuItem`)에 항목 추가만 하면 진입점 확보.

## 스코프

### P1 — 백엔드: price offer 도메인 + DM 임베드

`marketplace_appointments` 패턴 그대로 미러:

1. 테이블 `marketplace_price_offers`: `id, listing_id, conversation_id, proposer_id, amount(BIGINT, VND), status(PROPOSED/ACCEPTED/DECLINED/CANCELLED), created_at, updated_at` — init SQL(appointments 시드와 같은 위치에 신규 번호).
2. `POST /market/price-offers` — body `{listing_id, conversation_id, amount}`. 검증: 세션=구매자(판매자 본인 제안 403), `is_negotiable` false → 403, amount > 0. 성공 시 `DmMessage(message_type='price_offer', meta={'offerId': id})` 삽입 + conversation `last_message_at` 갱신 (appointment와 동일).
3. `PATCH /market/price-offers/{id}/accept|decline` — 판매자만. `cancel` — 제안자만(PROPOSED 상태에서만).
4. `dm.py`: `_offer_for()` → `DmMessageOut.price_offer` 임베드 (appointment `_appt_for` 옆에 동일 구조).

**검증**: curl 시나리오 — 구매자 제안 201 → 메시지 목록에 price_offer 임베드 확인 → 판매자 accept 200/구매자 accept 403 → is_negotiable=false 매물 403. ruff 0.

### P2 — 프론트: 가격제안 시트 + 진입점 2곳

1. **PriceOfferSheet** (기존 `BottomSheet` 재사용): 상단 매물 카드(DmDetail contextCard 스타일 재사용) + 금액 입력(숫자 키패드, VND 천단위 포맷) + 빠른 감액 칩 3개 + "제안하기" CTA. 당근 레퍼런스의 풀스크린 대신 **바텀시트**로 — 앱의 기존 시트 패턴(약속잡기 AppointmentLocationPicker, 침수 제보)과 통일.
2. 진입점 ① `MarketDetail`: `is_negotiable && !본인매물`일 때 "가격제안" 버튼 — 탭 시 `createConversation`(기존 handleChat 로직 재사용) → 시트 → 전송 후 `/dm/{conv.id}` 이동.
3. 진입점 ② `DmDetail` MessageComposer `[+]` 메뉴: `contextListing?.isNegotiable`일 때 "가격제안" 항목 추가 (약속잡기 항목 옆).
4. `api/dm.ts` 또는 `api/market.ts`에 `proposePriceOffer/acceptPriceOffer/declinePriceOffer/cancelPriceOffer` (appointment API 4종 미러).

**검증**: `tsc -b` 0, eslint error 0. 웹앱에서 매물상세→가격제안→DM 카드 노출 육안 확인.

### P3 — 프론트: DM 타임라인 price_offer 메시지 카드

appointment 메시지 카드 패턴 미러: 금액(크게) + 원가 대비 표시 + 상태 뱃지(제안됨/수락됨/거절됨/취소됨). 판매자 뷰에는 PROPOSED 상태에서 [수락] [거절] 버튼, 제안자 뷰에는 [취소]. 상태 변경 시 목록 리프레시(appointment와 동일 흐름).

**검증**: 두 계정(구매자/판매자)으로 제안→수락 왕복 육안 확인. 거절/취소 상태 표시 확인.

### P4 — i18n + 마무리

- ko/en/vi 3로케일 (`dm.priceOffer*` 키 계열 — appointment 키 네이밍 컨벤션 따름).
- codebase-memory `index_repository(mode: moderate)` 재인덱싱 + ADR 갱신(동네마켓 메뉴 갭에서 가격제안 제거).

## 비스코프 (요청 시에만)

- 수락 시 **listing 가격 자동 변경 없음** — 제안·수락은 대화 기록일 뿐, 실거래가는 당사자 몫 (당근도 동일).
- 별도 푸시 알림 없음 — DM 메시지 푸시(SGR-274)가 이미 커버.
- 제안 횟수 제한/쿨다운 없음 (어뷰징 신고는 기존 체계).

## 결정 필요 (구현 전 확인)

| # | 항목 | 권장안 |
|---|---|---|
| 1 | 감액 칩 단위 (VND) | 현재가 비례 3단계: `-1%/-3%/-5%`를 1만 VND 단위 절사. 고정액(-2/3/5만원)은 원화 기준이라 VND 가격대(수백만~수천만)에 안 맞음 |
| 2 | 동일 매물 재제안 정책 | PROPOSED 상태 제안이 있으면 신규 제안 시 기존 것 자동 CANCELLED (중복 방지, 테이블 partial unique 불요) |
| 3 | 수락 후 표시 | 채팅 카드 상태 뱃지만. 매물 상세에는 미노출 |

## 위임 계획 (모델 라우팅)

- P1(백엔드 미러링)·P4(i18n): 기계적 패턴 복제 — **Sonnet 서브에이전트** 적합.
- P2·P3(시트 UI/메시지 카드 디자인): 품질 요구 — **Fable** 직접 또는 Fable 서브에이전트.
- 완료 후 qm-reviewer로 독립 검토 → /code-review → push.
