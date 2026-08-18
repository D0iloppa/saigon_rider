# W2 — 판매자(개인 C2C) 관점 준비도 감사 (2026-08-17, HEAD 728031b)

## 0. 요약

개인 판매자가 매물을 올리고, 문의를 받고, 거래를 완료하는 핵심 루프(등록→문의→약속→완료→후기)는 코드상 **다 이어져 있다**. 등록은 사전승인 없이 즉시 노출(ON_SALE)되어 초기 공급 축적에는 유리하다. 다만 세 가지가 판매자 이탈 요인으로 명확하다: (1) 관리자가 매물을 HIDE/REMOVE 하면 판매자 본인도 그 매물을 다시는 열람·수정·재제출할 수 없고(`market.py:455-456`이 소유자 예외 없이 404), 통지 링크(`listings.py:28` HIDE 액션의 `with_link=True`)를 눌러도 같은 이유로 깨진다 — 유일한 탈출구는 알림 텍스트를 읽고 설정>고객센터로 수동 문의하는 것뿐. (2) 노쇼(no-show) 개념이 코드 전체에 전혀 없다 — 취소만 있고 이력·제재 연결이 없다. (3) 판매자가 자기 매물 전체의 성과(조회·찜·문의)를 한눈에 보는 대시보드가 없고, "내 매물" 리스트 카드의 찜/문의 카운트가 사실상 유일한 신호다. 수수료·정산 경로는 존재하지 않는다 — 완전 무료 C2C로 설계된 것으로 판단된다(코드 부재 자체가 판정 근거).

## 1. 여정 단계별 판정표

| # | 단계 | 기능 | 판정 | 코드 근거 | 비고 |
|---|---|---|---|---|---|
| S-1a | 판매 진입 | 판매 FAB 진입점 | ✅완성 | `frontend/src/pages/market/MarketMain.tsx:776` (`writeFab`, `requireAuth()` 가드 후 `/market/new`) | 로그인 안 된 상태면 `requireAuth()`가 먼저 막음(전화인증 아님, 로그인 게이트) |
| S-1b | 판매 진입 | 전화인증 게이트(마찰) | ✅완성 (마찰 실측 가능) | `backend/app/routers/market.py:631-634` (`create_listing`: `business_profile is None and seller.phone_verified_at is None` → 403) / `frontend/.../MarketCreate.tsx:249-255` (제출 시 미인증이면 draft 저장 후 `/auth/phone-verify` 리다이렉트) | 개인 판매자만 게이트, 승인된 업체 프로필 명의 등록은 우회(`market.py:597-609`) |
| S-1c | 판매 진입 | 초안(draft) 저장·복구·TTL | ✅완성 | `frontend/.../MarketCreate.tsx:21-23`(`DRAFT_MAX_AGE_MS = 7일`), `:48-68`(`readDraft` 만료·스키마 검증 후 자동 폐기), `:70-84`(`writeDraft`/`removeDraft`, localStorage 예외 무시), `:244-247`(변경 시 자동 저장) | 키는 `user.id + businessProfileId` 조합(`:99`) — 개인/업체 컨텍스트별 별도 초안 |
| S-2a | 매물 등록 | 폼 필드(제목/카테고리/가격/설명/상태) | 🟡부분 | `frontend/.../MarketCreate.tsx:355-405` | 카테고리는 선택(optional, `:363-376`), "중고/새것" 같은 컨디션 필드 자체가 아예 없음 — 스키마에 조건 필드 부재(`price_vnd`, `title`, `description`, `category_id`, `district_id`, `image_content_ids`만 존재, `backend/app/schemas.py` `MarketplaceListingCreateRequest` 부근) |
| S-2b | 매물 등록 | 가격 입력·통화(VND)·나눔 처리 | ✅완성 | `frontend/.../MarketCreate.tsx:378-394`(빈값=나눔), `marketFormat.ts:7-11`(`formatPriceVnd`, 0=나눔 i18n) | |
| S-2c | 매물 등록 | 이미지 다중 업로드·순서·실패 재시도 | ✅완성 | `MarketCreate.tsx:20`(`MAX_IMAGES=10`), `:152-169`(`uploadImage`, 실패 시 `failed:true`), `:193-197`(`retryImage`), `:206-224`(`postBlockReason`이 업로드 중/실패 시 제출 차단 — S-6 결함 수정 주석 명시) | 이미지 순서는 배열 index → `sort_order`(`market.py:670-671`) |
| S-2d | 매물 등록 | 위치 지정 | ✅완성 | `MarketCreate.tsx:407-415`(구 선택 필수, `postBlockReason`에 포함), `market.py:637-638`(`in_service_area` 서비스권역 밖 422), `:641-646`(좌표→ward 자동 배정, 동네지도 노출 연동) | |
| S-2e | 매물 등록 | 이미지 업로드 경합(동시성) | ⚠️미검증 | — | 단일 사용자 업로드 순차 처리(`handleImageSelect`가 `for` 루프로 순차 await, `:188-190`)라 클라이언트 측 경합은 설계상 회피됐지만, 서버측 동시 등록 트랜잭션 경합은 코드 열람만으로 확인 불가 |
| S-3a | 등록 후 검수 | 사전승인 없이 즉시 노출 | ✅완성 (확인됨, 구조적 특징) | `market.py:655`(`create_listing`이 `status="ON_SALE"`로 즉시 생성) / `_VALID_STATUSES`(`market.py:71`)에 `PENDING`류 상태 없음 | 사전검수 큐가 아예 없음 — "미구현"이 아니라 "설계상 사후 모더레이션"임을 코드로 확인 |
| S-3b | 등록 후 검수 | 관리자 검수 큐·자동 플래그 | ✅완성 | `backend/app/routers/admin_api/listings.py:24`(`_LISTING_STATUSES`), `:82-92`(`_flags_for`: LOW_PHOTOS/ZERO_PRICE/NO_CATEGORY/DUPLICATE 자동 플래그), `:95-117`(근접중복 탐지) | 사후 반응형 큐 — 신고(report) 또는 관리자 순찰 기반, 등록 즉시 차단 아님 |
| S-3c | 등록 후 검수 | 반려 시 사유 전달 | 🟡부분 | `listings.py:27-31`(`_MODERATE_ACTIONS`: HIDE/REMOVE/RESTORE), `:228-249`(`_apply_moderation`이 사유 포함 `Notification(type="MODERATION", body=f"...사유: {reason}")` 생성) | 알림 텍스트로는 전달되나, HIDE 알림의 링크(`with_link=True`, `:28`)를 누르면 `/market/{id}`로 이동 — 그러나 `market.py:455-456`이 HIDDEN 상태를 **소유자 예외 없이** 404 처리해 링크가 깨짐(아래 §2 참고) |
| S-3d | 등록 후 검수 | 재제출 경로 | ❌미구현 | `market.py:714`(`update_listing`이 `status in ("SOLD","HIDDEN","REMOVED")`면 409 `not_editable`), `market.py:767-769`(`update_status`도 HIDDEN/REMOVED에서 판매자 전이 전면 차단), `listings.py:30`(`RESTORE`는 관리자 전용 액션) | 판매자 자력으로 고쳐서 재등록하는 경로 없음. 상세 페이지 자체가 404라 진입조차 불가 |
| S-4a | 매물 관리 | 내 판매 목록 화면 | ✅완성 | `frontend/.../MarketSearch.tsx:49-50,118-121`(`?mine=1` 쿼리로 동일 화면 재사용, `t('profile.tabMyListings')` 타이틀), `:79-94`(`sellerId: isMine ? userId : null`, `hideSold: isMine ? false : true`로 SOLD도 노출) | 별도 전용 화면(MarketMy.tsx 등)은 없고 MarketSearch 재사용 — 기능은 충족 |
| S-4b | 매물 관리 | 수정/삭제(철회) | ✅완성 | `MarketDetail.tsx:421-428`(수정/철회 버튼), `market.py:794-815`(철회 시 ACCEPTED 약속 있으면 409 `active_appointment` — F-7), `:770-793`(철회↔재판매 왕복, 업체 상한 재검사) | "삭제"는 실제 DELETE가 아니라 WITHDRAWN 상태 전이(복구 가능) |
| S-4c | 매물 관리 | 끌어올리기(bump) | ✅완성 | `market.py:72`(`_BUMP_COOLDOWN = timedelta(hours=4)`), `:860-885`(`bump_listing`, ON_SALE만·쿨다운 429), `MarketDetail.tsx:399-408`(쿨다운 남은시간 UI) | |
| S-4d | 매물 관리 | 상태 전환(판매중/예약중/판매완료) | 🟡부분 | `market.py:750-754`(SOLD는 PATCH로 전이 불가, `complete_appointment` 경로 전용), `schemas.py:269`(`ON_SALE\|RESERVED\|SOLD\|WITHDRAWN` 4값) | "예약중"(RESERVED) 중간 상태는 **존재**하지만 판매자가 수동으로만 켜고 끄는 자유 토글이며 구매자·약속과 자동 연동되지 않음(약속 수락이 자동으로 RESERVED로 바꾸는지는 미검증) — 구조 질문 §2-3 참고 |
| S-4e | 매물 관리 | 노출 통계(조회수·찜수·문의수) | 🟡부분 | `market.py:475`(`listing.view_count += 1`, 상세 조회마다 증가 — 판매자 본인 열람도 카운트됨, 자기조회 배제 로직 없음), `ListingCard.tsx:37-52`("내 매물" 리스트 카드에 `likeCount`/`chatCount` 노출, 0이면 숨김) | 상세 페이지의 조회수는 표시되나(`MarketDetail.tsx:340`) 좋아요수는 **판매자 화면에는 표시 안 됨**(하트+카운트는 `!isSeller` 분기에만 있음, `:442-471`) — 집계 대시보드 부재, §2-1 참고 |
| S-5a | 문의 응대 | DM 수신·미읽음 | ✅완성 | `frontend/.../DmList.tsx:79-81`(대화별 `unreadCount` 배지), `useDmStore`의 `refreshUnread()` | |
| S-5b | 문의 응대 | 여러 구매자 동시 응대 구분 | 🟡부분 | `backend/app/routers/dm.py:225-244`(대화는 (참가자쌍, context_type, context_id) 유니크 — 매물별·구매자별 별도 대화), `DmList.tsx` 전체(대화 행에 상대 닉네임+미리보기만 표시, `contextListing` 필드(`frontend/src/api/types.ts:219`)를 렌더링하지 않음) | 여러 구매자는 별도 행으로 자연 분리되나(좋음), **어느 매물에 대한 문의인지는 목록에서 안 보임** — 매물 여러 개를 동시에 파는 판매자는 대화를 열어봐야 컨텍스트 확인 가능. DmDetail 진입 후에는 매물 컨텍스트 카드로 명확히 보임(`DmDetail.tsx:412-421`) |
| S-5c | 문의 응대 | 가격 제안 수락/거절 | ✅완성 | `market.py:1671-1710`(`accept_price_offer`/`decline_price_offer`), `DmDetail.tsx:614-635`(제안 카드 UI, 제안자 본인 여부로 버튼 분기) | |
| S-5d | 문의 응대 | 빠른 답장(quick reply) | ❌미구현 (화면 부재) | `DmDetail.tsx` 전체 — `MessageComposer`의 `menuItems`(`:733-777`)에 앨범/약속잡기/가격제안/이모티콘만 존재, 정형 빠른답장 템플릿 기능 없음 | |
| S-6a | 합의·약속 | 판매자측 약속 생성 권한 | ✅완성 | `market.py:1206-1214`(`_appointment_unlocked`: `user_id == listing.seller_id` → 항상 True), `:1279-1281`(구매자는 판매자의 가격제안 수락 또는 판매자 선제안이 있어야 잠금 해제) | 구매자보다 판매자 권한이 명시적으로 우선 — 스팸 약속 방지 설계 |
| S-6b | 합의·약속 | 장소/시간 지정 | ✅완성 | `market.py` `AppointmentProposeRequest`(when_at/place_name/place_lat/place_lng), `DmDetail.tsx:788-812`(약속 시트, `AppointmentLocationPicker`) | |
| S-6c | 합의·약속 | 노쇼(no-show) 처리 | ❌미구현 | 백엔드 전역(`grep -rn "no_show\|noshow\|NO_SHOW" backend/app` 무결과), `market.py:1526`(`cancel_appointment`)에 사유/이력 필드 없음, `UserSanction`(`models.py:1759-1774`)은 관리자 수동 제재 전용(`type` 자유문자열, 자동 트리거 없음) | 약속 취소만 있고 노쇼 개념·이력·자동 제재 연동 전무 |
| S-7a | 거래 완료 | 판매자 단독 완료 확정 | ✅완성 | `market.py:1390-1427`(`complete_appointment`: `listing.seller_id != session_uid` → 403, 완료 시 `listing.status="SOLD"`, `agreed_price_vnd` 스냅샷) | |
| S-7b | 거래 완료 | 구매자 완료 요청(S-16) 수신·확인·거절 | ✅완성 | `market.py:1430-1477`(`request_appointment_completion`, 판매자 본인은 403), `:1480-`(`decline_appointment_completion`), `DmDetail.tsx:489-566`(완료요청 배지·거절 버튼·거절 사유 안내 문구 "판매자가 거절"/"운영 검토 기각" 분기) | |
| S-7c | 거래 완료 | 이의 처리 | 🟡부분 | 구매자 완료요청 거절 이후 재요청 경로(`market.py:1462-1464`, 거절 후 재요청 허용)는 있으나, 판매자·구매자 사이 별도 "이의제기/분쟁" 전용 플로우는 없음 — `report_listing`(`:892-934`)/DM 신고(`reportConversation`)를 통한 관리자 개입이 유일한 상위 경로 | |
| S-8a | 판매 후 | 구매자 리뷰 받기 | ✅완성 | `market.py:984-1075`(`create_review`, 완료된 약속 참여자 검증, 중복 방지), `DmDetail.tsx:424-435`(SOLD 시 리뷰 배너/내 리뷰 표시) | |
| S-8b | 판매 후 | 판매 카운터·평판 반영 | ✅완성 | `market.py:498-506`(`sold_count`는 raw status 아닌 실제 `COMPLETED` 약속 집계 — MKT-3), `:1073`(`_recompute_manner_temp`), `MarketDetail.tsx:311-330`(TrustTierChip/평점/판매건수 노출) | |
| S-8c | 판매 후 | 재판매 유도(cross-sell nudge) | ❌미구현 (화면 부재) | `DmDetail.tsx`/`MarketDetail.tsx` 전체 — SOLD 이후 "비슷한 매물 다시 올리기" 등 유도 UI/CTA 없음 (다른 매물 노출은 `otherListings`뿐, 이는 판매완료 유도가 아니라 상세페이지 상시 노출) | |
| S-9a | 판매자 보호 | 사기 구매자 신고 | ✅완성 | `DmDetail.tsx:844-853`(대화 신고 시트, `DM_REPORT_REASONS`), `dm.py`의 `reportConversation` 경로 | |
| S-9b | 판매자 보호 | 차단 | ✅완성 | `market.py:938-963`(`block_user`/`unblock_user`/`list_blocks`), `dm.py`의 `require_unblocked`가 차단 시 약속/제안 등 상호작용 차단 | |
| S-9c | 판매자 보호 | 노쇼/취소 이력 | ❌미구현 | S-6c와 동일 근거 — 취소 자체엔 이력 축적 없음, `MarketplaceAppointment` 취소 건수를 프로필에서 조회하는 코드 없음 | |
| S-9d | 판매자 보호 | 전화번호 노출 범위 | ✅완성 | `backend/app/utils.py:124-132`(`mask_phone`: 앞 2자리만 노출, 나머지 마스킹), `market.py:519`(`phone_masked=mask_phone(...) if seller.phone_verified_at is not None else None`) — 원문 전화번호가 매물/셀러 API 응답 어디에도 없음(`schemas.py`의 `SellerBrief`엔 `phone_masked`만 존재) | |
| S-10 | 수익/정산 | 수수료·정산 경로 | ✅없음 (무료 C2C로 판단) | `grep -rn "commission\|수수료\|정산\|settlement\|payout" backend/app/routers/market.py backend/app/routers/biz.py` 무결과 | 결제/정산 모델 자체가 코드베이스에 없음 — "미구현"이 아니라 "설계상 부재"로 판정(당근마켓류 무료 C2C 컨셉과 일치) |

## 2. 구조적 질문에 대한 답

**Q1. 판매자가 자기 매물의 성과(조회·찜·문의 수)를 볼 수 있는 화면이 존재하는가?**
부분적으로. 전용 "성과 대시보드" 화면은 없다. 대신 (a) "내 매물" 리스트(`MarketSearch.tsx?mine=1`)의 각 카드가 `likeCount`/`chatCount`를 보여주고(`ListingCard.tsx:37-52`, 0이면 숨김), (b) 매물 상세 페이지가 `viewCount`를 보여준다(`MarketDetail.tsx:340`). 그러나 상세 페이지에서는 **판매자 본인에게 좋아요(찜) 수가 표시되지 않는다** — 하트 아이콘+카운트는 `!isSeller` 분기에만 있다(`MarketDetail.tsx:442-471`). 여러 매물을 합산한 총계·추이 그래프 같은 대시보드는 존재하지 않는다.

**Q2. 매물 등록 후 어드민 승인 전까지 판매자에게 상태가 어떻게 보이는가? 반려 사유 전달 경로가 있는가?**
등록은 승인 대기 없이 즉시 `ON_SALE`로 노출된다(`market.py:655`) — "승인 대기" 상태 자체가 없다. 사후에 관리자가 `HIDE`/`REMOVE` 조치를 하면 판매자에게 사유 포함 인앱 알림(`Notification(type="MODERATION", body=f"...사유: {reason}")`, `admin_api/listings.py:240-249`)이 간다. 그러나 조치 이후 그 매물은 판매자 본인에게도 상세 페이지가 404가 되고(`market.py:455-456`, 소유자 예외 없음) "내 매물" 목록에서도 제외된다(`market.py:340-347`, 자기 매물 조회여도 HIDDEN/REMOVED는 항상 숨김). HIDE 알림의 딥링크(`with_link=True`)를 눌러도 같은 이유로 오류 화면만 뜬다. 재제출 경로는 없고(`update_listing`이 HIDDEN/REMOVED를 409로 거부, `RESTORE`는 관리자 전용), 판매자가 취할 수 있는 유일한 다음 행동은 알림 문구를 읽고 설정>고객센터(`frontend/src/pages/settings/CustomerSupport.tsx`)로 별도 문의하는 것뿐이다(알림에서 CS로 바로 연결되는 링크는 없음).

**Q3. "예약중" 같은 중간 상태가 있는가, 아니면 ON_SALE/SOLD 2값뿐인가?**
`RESERVED`가 `_VALID_STATUSES`(`market.py:71`)와 `schemas.py:269`에 정식으로 존재하며, 판매자가 상세 페이지의 상태 셀렉터로 수동 전환할 수 있다(`MarketDetail.tsx:429-439`, `STATUSES = ['ON_SALE','RESERVED']`). 다만 약속 수락(`accept_appointment`)이 매물을 자동으로 RESERVED로 바꾸는지는 이번 감사에서 코드를 직접 추적하지 않아 미검증이다 — 프론트 주석(`DmDetail.tsx:351`)은 "약속 상태 변경이 매물 상태(RESERVED/SOLD/ON_SALE)를 바꾸므로 컨텍스트 갱신"이라고 적어 자동 연동을 암시하나, `accept_appointment` 백엔드 본문(`market.py:1365-1390` 부근)은 이번 조사에서 상세히 읽지 않았다.

**Q4. 동일 판매자가 여러 구매자와 동시 협상 중일 때 UI가 이를 구분해 주는가?**
대화 자체는 (판매자, 구매자, 매물) 조합마다 별도 레코드로 분리되어(`dm.py:225-244`) 절대 뒤섞이지 않는다. DM 목록 화면(`DmList.tsx`)은 구매자 닉네임·안읽음 배지·마지막 메시지 미리보기로 각 협상을 행 단위로 구분해 주지만, **어느 매물에 대한 협상인지는 목록에 나타나지 않는다** — `DmConversation.contextListing` 필드가 있음에도(`frontend/src/api/types.ts:219`) `DmList.tsx`가 이를 렌더링하지 않는다. 대화를 열면(`DmDetail.tsx:412-421`) 매물 컨텍스트 카드로 명확해진다.

## 3. 상용 차단 등급

- **P0 (이게 없으면 공개 불가)**: 없음. 핵심 등록→문의→약속→완료→후기 루프는 다 연결되어 있고, 전화번호 마스킹 등 최소한의 개인정보 보호도 되어 있다.
- **P1 (공개는 되나 판매자가 이탈)**:
  - 모더레이션(HIDE/REMOVE) 후 판매자 자력 재제출·상세 열람 경로 전무 + 알림 딥링크가 깨진 채로 방치(`market.py:455-456`, `listings.py:28`) — 억울하게 반려당한 판매자가 이유를 알아도 스스로 아무것도 못 하고 CS에 별도 문의해야 함.
  - 노쇼(no-show) 개념·이력·제재 연동 전무 — 반복 노쇼 구매자를 걸러낼 방법이 차단(수동) 외에 없음.
  - DM 목록에 매물 컨텍스트 미표시 — 매물 여러 개를 동시에 파는 활성 판매자일수록 혼동 커짐.
  - 판매자 화면에서 좋아요(찜) 수 비표시(`MarketDetail.tsx:442-471`이 `!isSeller`에만 하트+카운트 노출) — 판매자가 자기 매물 반응을 온전히 못 봄.
- **P2 (개선 여지)**:
  - 매물 등록 폼에 컨디션(중고/새것 등) 필드 부재.
  - 빠른 답장(quick reply) 템플릿 없음.
  - 판매 완료 후 재판매/재등록 유도 UI 없음.
  - 매물별 통계를 합산한 대시보드(추이·총계) 부재 — 카드 단위 카운트만 존재.
  - `view_count`가 판매자 본인 조회도 그대로 집계(`market.py:475`, 자기조회 배제 없음) — 통계 신뢰도 저하.

## 4. 미검증으로 남긴 것

- `accept_appointment`(`market.py:1365-1390` 부근)가 매물 상태를 자동으로 RESERVED로 전환하는지 여부 — 프론트 주석은 암시하나 백엔드 본문을 직접 확인하지 않음(구조적 질문 Q3).
- 이미지 업로드의 서버측 동시성 경합(같은 매물에 여러 클라이언트/탭이 동시 편집하는 경우) — 클라이언트는 순차 업로드라 클라이언트측 경합은 회피되지만 서버측은 미검증(S-2e).
- 어드민 콘솔(`admin-frontend/`) 실제 화면에서 검수 큐가 어떻게 렌더링되는지는 API(`admin_api/listings.py`, `reports.py`) 코드만 확인했고 프론트 컴포넌트는 열람하지 않음 — 이번 축은 "판매자 관점"이라 어드민 UX는 범위 밖으로 판단.
- `_LISTING_INACTIVE_STATUSES`/업체 매물 상한(T-3, 5건) 로직은 업체 판매자 경로이며, 이번 감사는 개인(C2C) 판매자 축에 집중해 업체 전용 세부 규칙(예: 5건 초과 시 UX)은 깊이 파지 않았다.
- 노쇼·완료거절 반복 시 `manner_temp`(매너온도)에 부정적 영향이 실제로 반영되는지 — `_recompute_manner_temp`는 리뷰 평점만 반영하는 것으로 보이나(`market.py:1073` 호출부만 확인, 함수 본문인 `:81-98`은 시그니처만 확인하고 전체 로직은 상세 추적하지 않음) 노쇼와의 연결고리는 코드상 존재 자체가 없어 "없음"으로 판정했지만 함수 내부 가중치 로직까지 완전히 정독하지는 않았다.
