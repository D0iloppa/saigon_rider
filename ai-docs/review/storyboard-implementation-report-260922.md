# 스토리보드 구현 결과 보고서 — 2026-09-22

## 판독 기준

- 대상 명세: `ai-docs/review/storyboard/index.html` (66개 프레임).
- 비교 기준점: `700c2a20`.
- `기준 구현`은 위 기준점에 이미 있던 기능, `이번 반영`은 기준점 이후 현재 작업 트리에 추가된 변경이다. 화면 시각·실기기·컨테이너 통합 검증은 이 보고서 작성 시점에 완료되지 않았으므로, 코드/계약 테스트 통과와 동의어가 아니다.
- 사용자 지시대로 결정이 필요한 사항은 아래 **AI 권장 결정**으로 처리했으며, 제품 소유자의 확정 결정으로 표기하지 않는다.
- `기본 유지`는 프레임의 핵심 경로가 이미 구현되어 있고, 스토리보드가 요구하지 않은 재설계는 하지 않았다는 뜻이다. `후속 QA`는 사용자 기기 테스트 피드백을 기록할 자리다.

## AI 권장 결정 및 경계

| 결정 | AI 권장안 및 실제 조치 | 근거/경계 |
|---|---|---|
| 인증 게이트 | **탐색은 비로그인에 열고, 쓰기·개인화·상대방에게 영향을 주는 행동만 로그인 게이트**로 유지한다. 판매 등록은 개인 휴대폰 인증을 명시적으로 요구하고, 인증 전 초안은 보존한다. | F-S0-01, F-S1/F-MP 탐색 원칙. 지도 검색의 실제 게이트 변경은 별도 검증 대상이다. |
| 업체 철회 | **즉시 비활성화 금지, 고객센터 철회 요청 접수**로 처리했다. | 계약·광고·공개 매물 상태를 한 버튼으로 파괴하지 않기 위해서다. `BizManage.tsx`에서 확인 후 문의 초안을 연다. |
| 물품 확인/송금 신고 | **구매자의 물품 확인 → 약속 시각 -30분~+60분 안 송금 신고 → 판매자 확인** 순서를 강제했다. | 현금/개인송금의 실제 결제를 플랫폼이 보증하지 않는다는 기존 경계를 유지한다. |
| 운영자 롤백 | **PAYMENT_REPORTED + 예약 활성 상태만** 운영자가 사유를 남겨 약속 취소·매물 판매중 복구할 수 있게 했다. PAYMENT_CONFIRMED 이후 금액/결제상태 변경은 금지다. 양 당사자 알림·감사 로그를 남긴다. | F-S6-01 안전 복구. 실제 운영 권한/관리자 UI E2E는 후속 확인 필요. |
| 전역 무전기/위치 버블 | **드래그형 전역 버블과 기존 z-order 저장소를 삭제하고 `ActiveSessionBar`를 유일한 세션 표면으로 통합**했다. 전역 세션은 고정 바, DM에서는 composer 바로 위 인라인 바로 제공한다. | 중복·예측 불가능한 드래그 표면을 제거하고 세션 진입점을 하나로 통일하는 AI 권장 결정이다. |
| 그룹 기능 | `F-CM-02 FR-1`의 A(탐색 진입점 추가) / B(오픈 범위 라우트 차단) 중 제품 선택 근거가 부족하여 **기존 비공개/직접경로 상태를 보존**했다. 새 공개 진입점도, 파괴적 라우트 제거도 하지 않았다. | 임의로 커뮤니티를 공개하거나 기존 가입자 경로를 끊지 않는 최소 변경이다. |

## 프레임별 추적표

| ID | 요구 행동 | 상태 및 조치 | 관련 파일 | 검증 / 사용자 기기 QA 피드백 |
|---|---|---|---|---|
| F-N-01 FR-1 | 두 드래그 전역 버블의 문제를 드러낸다. | **완료: 레거시 `WalkieTalkieFloatingButton`, `LiveLocationFloatingButton` 및 z-order 저장소를 삭제하고 중복 드래그 표면을 제거했다.** | `frontend/src/App.tsx`, `frontend/src/components/shell/ActiveSessionBar.tsx`, 삭제된 `frontend/src/components/dm/WalkieTalkieFloatingButton.tsx`, 삭제된 `frontend/src/components/dm/LiveLocationFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. 전체 guest map test는 무관한 기존 assertion failure. QA: ____ |
| F-N-01 FR-2 | 진행 중 세션을 예측 가능한 고정 바로 제공한다. | **완료: `ActiveSessionBar`를 유일한 세션 표면으로 사용하고 전역에서는 fixed bar, DM에서는 composer 위 inline bar로 렌더링한다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/dm/DmDetail.tsx`, 관련 shell/DM 스타일 파일 | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. 전체 guest map test는 무관한 기존 assertion failure. QA: ____ |
| F-S0-01 FR-1 | 인증된 판매자가 사진·조건·장소를 넣어 등록한다. | 이번 반영: 거래 희망 장소를 가격/협상 조건 바로 뒤로 이동해 입력 순서를 정리했다. | `frontend/src/pages/market/MarketCreate.tsx`, `frontend/src/pages/market/MarketCreate.module.css`, `backend/app/routers/market.py` | `marketCreateDraftOtp.contract.test.mjs`; 기기 폼 QA: ____ |
| F-S0-01 FR-2 | 미인증 개인/미승인 업체의 등록을 차단하고 다음 행동을 안내한다. | 이번 반영: 개인은 휴대폰 인증 게이트와 복귀 경로를 제공하며 초안을 보존한다. 업체 승인 검증은 기존 서버 제약을 유지했다. | `frontend/src/pages/market/MarketCreate.tsx`, `backend/app/routers/market.py`, `frontend/src/pages/market/marketCreateDraftOtp.contract.test.mjs` | 계약 테스트 대상; 업체 상태 E2E: ____ |
| F-S0-02 FR-1 | 판매중/예약중 매물의 관리 액션을 제공한다. | 기준 구현 유지: 상태·가격 수정·끌어올리기·철회 API/관리 화면을 유지했다. | `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/market.py` | 이번 패스 UI 변경 없음. QA: ____ |
| F-S0-02 FR-2 | 철회/만료 매물은 판매중 뷰와 구분한다. | 기준 구현 유지: `WITHDRAWN` 상태와 목록/상세 표기를 유지했다. | `frontend/src/pages/market/ListingCard.tsx`, `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/market.py` | 상태 전이 DB QA: ____ |
| F-S0-02 FR-3 | 거래 결과 확인 핑은 되돌릴 수 없는 선택을 분명히 한다. | 이번 반영: ‘다른 곳에서 판매’/‘판매 포기’에 확인 1회를 추가하고, 상대 판매/계속 판매 문구를 구분했다. | `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/market.py` | 화면 확인 필요. QA: ____ |
| F-S1-01 FR-1 | 마켓 리스트에서 매물을 탐색한다. | 기준 구현 유지: 목록/정렬/카드 탐색. 카드 접근성 focus 보강은 이번 반영이다. | `frontend/src/pages/market/ListingCard.tsx`, `frontend/src/pages/market/ListingCard.module.css`, `backend/app/routers/market.py` | 키보드·터치 QA: ____ |
| F-S1-01 FR-2 | 매물 지도뷰에서 핀과 카드로 탐색한다. | 기본 유지: 현 지도뷰를 재설계하지 않았다. | `frontend/src/pages/market/MarketMain.tsx`, `frontend/src/components/map/*` | 시각/지도 인터랙션 미검증. QA: ____ |
| F-S1-01 FR-3 | 빈 결과에서 다음 탐색 행동을 안내한다. | 기본 유지: 기존 `StateBlock` 빈 상태를 유지했다. | `frontend/src/pages/market/MarketMain.tsx`, `frontend/src/components/ui/StateBlock.tsx` | 빈 데이터 QA: ____ |
| F-S1-01 FR-4 | 키워드/필터 검색으로 발견을 계속한다. | 기본 유지: 기존 목록 검색 API 및 UI를 유지했다. | `frontend/src/pages/market/MarketMain.tsx`, `backend/app/routers/market.py` | 검색어·필터 QA: ____ |
| F-S1-02 FR-1 | 찜 목록에서 재방문하고 해제한다. | 이번 반영: 카드 안 찜 해제 버튼을 추가해 상세 진입 없이 목록에서 해제한다. | `frontend/src/pages/market/MarketWishlist.tsx`, `frontend/src/pages/market/ListingCard.tsx`, `frontend/src/pages/market/ListingCard.module.css`, `backend/app/routers/market.py` | 토글 실패/낙관 갱신 QA: ____ |
| F-S1-02 FR-2 | 키워드 알림을 관리한다. | 기준 구현 유지: 생성/수정/삭제 및 알림 발송 경로는 건드리지 않았다. | `frontend/src/pages/market/MarketKeywordAlerts.tsx`, `backend/app/routers/market.py`, `backend/app/noti_worker/__main__.py` | 실제 알림 발송 QA: ____ |
| F-S2-01 FR-1 | 구매자는 매물·판매자 신뢰·찜·제안·채팅을 판단한다. | 이번 반영: 예약중에도 채팅을 열어 기존 대화/문의 연속성을 보존했다. | `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/market.py` | 예약중 타 사용자 정책 QA: ____ |
| F-S2-01 FR-2 | 더보기에서 신고·차단 같은 안전 행동을 분리한다. | 이번 반영: 차단 전 결과를 설명하고 확인 1회를 거치게 했다. 신고는 기존 경로 유지. | `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/market.py` | 차단/해제와 목록 숨김 QA: ____ |
| F-S3-01 FR-1 | 첫 문의 DM은 매물 문맥과 메시지 전송을 제공한다. | 기준 구현 유지; 무전기 상시 헤더 진입을 줄이는 변경은 F-N-01에 기록했다. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/dm/DmDetail.module.css` | DM 실기기 QA: ____ |
| F-S3-01 FR-2 | 더보기에는 안전 행동을 성격별로 분리한다. | 기본 유지: 기존 더보기/나가기/신고 문법을 이번에 재배치하지 않았다. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/dm/DmDetail.module.css` | 메뉴 위계 QA: ____ |
| F-S3-01 FR-3 | 첨부 메뉴로 보조 입력을 제공한다. | 기본 유지: 파일/사진 등 현 첨부 메뉴를 유지했다. | `frontend/src/pages/dm/DmDetail.tsx` | 네이티브 첨부 QA: ____ |
| F-S3-01 FR-4 | 메시지 롱프레스의 파괴 액션은 확인한다. | 이번 반영: 메시지 삭제를 즉시 실행하지 않고 확인 모달을 추가했다. | `frontend/src/pages/dm/DmDetail.tsx` | 롱프레스→취소/삭제 QA: ____ |
| F-S3-02 FR-1 | 대화 안 제안 카드로 거래 조건을 제시한다. | 기준 구현 유지: 가격 제안 카드/시트 및 서버 상태를 유지했다. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/components/market/PriceOfferSheet.tsx`, `backend/app/routers/market.py` | 제안 수락/거절 QA: ____ |
| F-S3-03 FR-1 | 무전기 진입점의 중복을 정리한다. | 부분 반영: 홈·DM목록 헤더 진입 제거. 상세/세션 정책은 미완료다. | `frontend/src/pages/home/HomePage.tsx`, `frontend/src/pages/dm/DmList.tsx`, `frontend/src/pages/dm/DmDetail.tsx` | 진입점 전수 QA: ____ |
| F-S3-03 FR-2 | 캡슐의 접힘/펼침/녹음 상태를 제공한다. | **완료: 레거시 드래그 캡슐을 삭제하고 세션 상태를 `ActiveSessionBar`에 통합했다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, `frontend/src/App.tsx`, 삭제된 `frontend/src/components/dm/WalkieTalkieFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S3-03 FR-3 | 무전기 롱프레스 메뉴를 제공한다. | **완료: 레거시 롱프레스 드래그 메뉴를 제거하고 단일 세션 바 표면으로 정리했다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, 삭제된 `frontend/src/components/dm/WalkieTalkieFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S3-03 FR-4 | 무전기 세션을 종료한다. | **완료: 세션 종료 동작을 `ActiveSessionBar`의 단일 표면으로 통합했다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, `backend/app/services/walkie_module.py`, 삭제된 `frontend/src/components/dm/WalkieTalkieFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S3-03 FR-5 | 무전기는 S5 게이트/고정 바로로 통합한다. | **완료: 무전기 세션을 S5 세션 게이트와 `ActiveSessionBar`로 통합했다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/dm/DmDetail.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S4-01 FR-1 | 약속 설정은 대화 문맥의 장소를 우선 제안한다. | 이번 반영: 매물에 있는 좌표/구를 약속 시트 초깃값으로 넣되 GPS 요청·지오코딩은 하지 않는다. | `frontend/src/pages/dm/DmDetail.tsx` | 장소 변경/권한 미요청 QA: ____ |
| F-S4-01 FR-2 | 약속 시트에서 시각·장소를 확정한다. | 기준 구현 유지, 위 초깃값만 보강했다. | `frontend/src/pages/dm/DmDetail.tsx`, `backend/app/routers/market.py` | 날짜/장소 입력 QA: ____ |
| F-S4-01 FR-3 | PROPOSED 약속 카드를 대화에 표시한다. | 기준 구현 유지. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/api/dm.ts`, `backend/app/routers/market.py` | 양 당사자 갱신 QA: ____ |
| F-S5-01 FR-1 | ACCEPTED 약속에서 거래 도구를 제공한다. | 이번 반영: 약속 취소 시 상대방에게만 durable `market.appointment_cancelled` SOCIAL 알림/푸시를 넣었다. 결제 절차 강화는 F-S6에 반영했다. | `backend/app/routers/market.py`, `backend/app/noti_worker/__main__.py`, `backend/app/services/push_i18n.py`, `backend/app/tests/test_marketplace_transaction.py`, `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/dm/TradeTransaction.tsx` | BFF 집중 테스트 12 passed. 실푸시 QA: ____ |
| F-S5-01 FR-2 | 실시간 위치 공유 초대 카드를 제공한다. | 기준 구현 유지. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/components/dm/LocationShareConsentModal.tsx`, `frontend/src/lib/locationShareInvite.ts` | 위치 권한/초대 QA: ____ |
| F-S5-01 FR-3 | 위치공유 중 현재 버블/모달 동작을 제공한다. | **완료: 레거시 위치공유 버블을 삭제하고 위치공유 세션을 `ActiveSessionBar` 표면으로 통합했다. 모달/초대 흐름은 유지한다.** | `frontend/src/components/dm/LocationShareConsentModal.tsx`, `frontend/src/lib/locationShareInvite.ts`, `frontend/src/components/shell/ActiveSessionBar.tsx`, 삭제된 `frontend/src/components/dm/LiveLocationFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S5-01 FR-4 | 위치공유를 고정 바 칸으로 통합한다. | **완료: 위치공유를 전역 fixed `ActiveSessionBar` 및 DM composer 위 inline bar로 통합했다.** | `frontend/src/components/shell/ActiveSessionBar.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/dm/DmDetail.tsx`, 삭제된 `frontend/src/components/dm/LiveLocationFloatingButton.tsx` | active-session contract PASS; legacy refs PASS; diff check PASS; targeted ESLint 0 errors/9 pre-existing warnings. QA: ____ |
| F-S6-01 FR-1 | 판매자는 QR 등록 전 거래 상태를 안내받는다. | 기준 구현 유지; 결제 단계가 물품 확인 후로 재배열됐다. | `frontend/src/pages/dm/TradeTransaction.tsx`, `backend/app/routers/market.py` | QR 등록 QA: ____ |
| F-S6-01 FR-2 | 약속 시각 창 밖 구매자에게 절차를 미리 보여 준다. | 이번 반영: 신고 버튼을 -30분 이전/+60분 이후 비활성화하고 안내 문구를 노출한다. | `frontend/src/pages/dm/TradeTransaction.tsx`, `frontend/src/locales/*/translation.json`, `backend/app/routers/market.py` | 시간대/클라이언트 시계 QA: ____ |
| F-S6-01 FR-3 | 대면 시 구매자가 물품 확인 후 송금을 신고한다. | 이번 반영: `buyer_inspected_at` 기록 없이는 신고를 409으로 거부하고 UI에도 확인 버튼/단계를 추가했다. | `database/init/236_marketplace_transaction_inspection.sql`, `backend/app/models.py`, `backend/app/routers/market.py`, `backend/app/schemas.py`, `frontend/src/api/dm.ts`, `frontend/src/api/types.ts`, `frontend/src/pages/dm/TradeTransaction.tsx` | `test_marketplace_transaction.py`, `tradeTransaction.contract.test.mjs`; DB migration 적용/실기기 QA: ____ |
| F-S6-01 FR-4 | 송금 신고 교착을 운영자가 안전하게 복구한다. | 이번 반영: 제한 롤백 API, 감사로그, 양 당사자 알림을 추가했다. | `backend/app/routers/admin_api/transactions.py`, `backend/app/noti_worker/__main__.py`, `backend/app/tests/test_admin_transactions.py` | 관리자 권한/워커 E2E QA: ____ |
| F-S6-01 FR-5 | 타임라인은 실제 거래 순서를 반영한다. | 이번 반영: 약속→물품 확인→QR→송금 신고→수령 확인→전달/완료 순으로 표시했다. | `frontend/src/pages/dm/TradeTransaction.tsx`, `frontend/src/locales/*/translation.json` | 스텝 전환 QA: ____ |
| F-S7-01 FR-1 | 완료 요청/처리 카드로 거래를 마무리한다. | 기준 구현 유지. | `frontend/src/pages/dm/DmDetail.tsx`, `backend/app/routers/market.py` | 양측 완료/거절 QA: ____ |
| F-S7-01 FR-2 | SOLD 뒤에도 DM 문맥과 후속 행동을 보존한다. | 기준 구현 유지. | `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/market/MarketDetail.tsx` | QA: ____ |
| F-S7-02 FR-1 | 거래 이력 목록에서 완료 거래를 재방문한다. | 기준 구현 유지. | `frontend/src/pages/profile/ProfileMain.tsx`, `backend/app/routers/market.py` | 이력 정렬 QA: ____ |
| F-X-01 FR-1 | 취소 경로의 마찰을 비교하고 안전한 취소를 제공한다. | 기본 유지: 약속 취소와 매물 철회는 기존 상태 전이를 유지했다. | `frontend/src/pages/dm/DmDetail.tsx`, `backend/app/routers/market.py` | 취소 후 상태 QA: ____ |
| F-X-01 FR-2 | 교착 상태를 사용자에게 안전하게 안내한다. | 부분 반영: 결제 신고 교착의 관리자 복구 경로를 추가했다. 일반 교착 UI는 기준 구현 유지. | `backend/app/routers/admin_api/transactions.py`, `frontend/src/pages/dm/TradeTransaction.tsx` | 운영 처리 UX QA: ____ |
| F-X-02 FR-1 | 신고 진입점의 문법을 통일한다. | 기본 유지: 이번 패스에서 6개 신고 진입점 통합은 하지 않았다. | `frontend/src/pages/market/MarketDetail.tsx`, `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/biz/BizPublic.tsx` | 후속 통합 판단 필요. QA: ____ |
| F-X-02 FR-2 | 차단은 결과 설명과 확인 후 실행한다. | 이번 반영: 매물 상세의 차단 확인을 추가했다. 다른 진입점은 기준 구현이다. | `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/users.py` | 상호 차단 영향 QA: ____ |
| F-P-01 FR-1 | 타인 프로필에서 신뢰·매물·게시물을 판단한다. | 기준 구현 유지. | `frontend/src/pages/profile/UserProfile.tsx`, `backend/app/routers/users.py` | QA: ____ |
| F-P-01 FR-2 | 타인 프로필 더보기에서 신고/차단을 제공한다. | 기본 유지: 이번 패스에서 해당 시트의 차단 부재를 바꾸지 않았다. | `frontend/src/pages/profile/UserProfile.tsx` | 후속 UX 결정. QA: ____ |
| F-P-01 FR-3 | 내 프로필 미리보기 모드를 구분한다. | 기준 구현 유지. | `frontend/src/pages/profile/UserProfile.tsx` | QA: ____ |
| F-P-01 FR-4 | 프로필의 매물/게시물 전체 목록을 제공한다. | 기준 구현 유지. | `frontend/src/pages/profile/UserProfile.tsx`, `frontend/src/pages/community/*` | QA: ____ |
| F-P-02 FR-1 | 개인 프로필 허브의 고정 헤더·소셜·행동을 제공한다. | 기준 구현 유지. | `frontend/src/pages/profile/ProfileMain.tsx` | QA: ____ |
| F-P-02 FR-2 | 인증 카드와 파트너 라운지 요약을 제공한다. | 기준 구현 유지; 라운지 철회 요청은 F-BZ-02에 반영. | `frontend/src/pages/profile/ProfileMain.tsx`, `frontend/src/pages/biz/BizManage.tsx` | QA: ____ |
| F-P-02 FR-3 | 개인 프로필에서 판매 관리/거래 이력으로 분기한다. | 기준 구현 유지. | `frontend/src/pages/profile/ProfileMain.tsx`, `frontend/src/pages/market/*` | QA: ____ |
| F-P-02 FR-4 | 내 피드에서 게시물을 CRUD한다. | 기준 구현 유지. | `frontend/src/pages/profile/ProfileMain.tsx`, `frontend/src/pages/profile/ProfilePosts.tsx`, `frontend/src/pages/feed/*` | QA: ____ |
| F-P-02 FR-5 | 도달 불가 게임화 잔재를 처리한다. | AI 최소 변경 결정: 코드/UI를 삭제하지 않고 도달 불가 상태를 유지했다. | `frontend/src/pages/profile/ProfileMain.tsx`, `frontend/src/pages/quest/*` | 제품 폐기 결정 필요. QA: ____ |
| F-CS-01 FR-1 | 고객센터 문의 탭에서 접수 후 상태를 조회한다. | 기준 구현 유지. | `frontend/src/pages/settings/CustomerSupport.tsx`, `backend/app/routers/support.py` | QA: ____ |
| F-CS-01 FR-2 | 신고 탭에서 접수 후 조회·취소한다. | 기준 구현 유지. | `frontend/src/pages/settings/CustomerSupport.tsx`, `backend/app/routers/support.py` | QA: ____ |
| F-CS-01 FR-3 | 새 문의 폼을 작성한다. | 기준 구현 유지; 업체 철회는 이 폼의 미리 채운 초안으로 연결된다. | `frontend/src/pages/settings/CustomerSupport.tsx`, `frontend/src/pages/biz/BizManage.tsx`, `backend/app/routers/support.py` | 철회 초안 전송 QA: ____ |
| F-CS-01 FR-4 | 신고 상세를 시트에서 확인한다. | 기준 구현 유지. | `frontend/src/pages/settings/SupportDetail.tsx`, `backend/app/routers/support.py` | QA: ____ |
| F-CS-02 FR-1 | 조회 전용 스레드의 답글 가능 여부를 정한다. | AI 최소 변경 결정: 기존 조회 전용 UI/API 불일치를 이번 패스에서 새 답글 UI로 확장하지 않았다. | `frontend/src/pages/settings/SupportDetail.tsx`, `backend/app/routers/support.py` | 제품/운영 정책 결정 필요. QA: ____ |
| F-CM-01 FR-1 | 커뮤니티 피드 목록에서 필터·카드 탐색을 제공한다. | 기준 구현 유지. | `frontend/src/pages/feed/FeedList.tsx`, `backend/app/routers/admin_api/feed.py` | QA: ____ |
| F-CM-01 FR-2 | 피드 상세에서 내 글 수정 가능 여부를 제공한다. | 기본 유지: 이번 패스에서 수정 진입점 문제를 확장하지 않았다. | `frontend/src/pages/feed/FeedDetail.tsx`, `backend/app/routers/admin_api/feed.py` | 후속 UX 결정. QA: ____ |
| F-CM-02 FR-1 | 그룹 탐색의 공개/비공개 범위를 정한다. | AI 최소 변경 결정: 공개 탐색 추가나 라우트 폐기 없이 기존 직접 경로 상태를 보존했다. | `frontend/src/App.tsx`, `frontend/src/pages/community/GroupList.tsx`, `frontend/src/pages/community/GroupCreate.tsx` | 오픈 범위 결정 필요. QA: ____ |
| F-CM-02 FR-2 | 그룹 상세에서 게시판·채팅·멤버 관리를 제공한다. | 기준 구현 유지; 관리자 강퇴 확인 개선은 이번 범위에 포함하지 않았다. | `frontend/src/pages/community/GroupDetail.tsx`, `backend/app/routers/dm.py` | 권한/강퇴 QA: ____ |
| F-MP-01 FR-1 | 동네지도에서 업체를 발견하고 개인화만 게이트한다. | 기본 유지: 탐색/개인화 게이트 통일은 AI 권장 원칙으로 기록했지만 지도 검색 게이트 코드는 이번 패스에서 바꾸지 않았다. | `frontend/src/pages/map/NeighborhoodMap.tsx`, `frontend/src/pages/map/MapSearch.tsx` | 로그아웃 탐색 QA: ____ |
| F-MP-01 FR-2 | 지도 내 업체 검색은 범위·빈 상태를 보존한다. | 기본 유지: 동네 범위 전달/전역 확장 CTA는 미구현이다. | `frontend/src/pages/map/MapSearch.tsx`, `backend/app/routers/biz.py` | 검색 범위 QA: ____ |
| F-BZ-01 FR-1 | 업체 상세에서 문의·신뢰·매물 전이를 제공한다. | 기본 유지: 헤더 공유/신고 재배치와 업체 맥락 전이는 이번 패스에서 변경하지 않았다. | `frontend/src/pages/biz/BizPublic.tsx`, `frontend/src/pages/market/MarketDetail.tsx`, `backend/app/routers/biz.py` | 업체→매물 전이 QA: ____ |
| F-BZ-02 FR-1 | 승인된 업체 라운지에서 운영·안전한 철회를 제공한다. | 이번 반영: 위험 톤 ‘업체 철회 요청’→확인→고객센터 초안으로 접수한다. 즉시 탈퇴/비활성화는 하지 않는다. | `frontend/src/pages/biz/BizManage.tsx`, `frontend/src/pages/biz/BizManage.module.css`, `frontend/src/pages/settings/CustomerSupport.tsx` | 접수 후 운영 처리 QA: ____ |

## 커버리지 검증

스토리보드의 `<h3 class="scene-id">`에서 추출한 프레임은 **66개**, 위 표의 `F-ID FR-n` 행도 **66개**다. 누락 ID는 없다.

현재 변경 중 자동화 검증 파일은 `backend/app/tests/test_marketplace_transaction.py`, `backend/app/tests/test_admin_transactions.py`, `frontend/src/pages/dm/tradeTransaction.contract.test.mjs`, `frontend/src/pages/market/marketCreateDraftOtp.contract.test.mjs`, `frontend/src/pages/market/storyboardMarket.contract.test.mjs`다. 확인된 실행 결과는 F-S5-01 FR-1의 BFF 집중 테스트 12 passed뿐이다. 결합 28개 실행에서는 환경 경로를 전제한 기존 계약 테스트 2개가 실패했으며, 이 보고서는 이를 이번 구현 실패로 분류하지 않는다. 최종 기기 QA에서는 각 행의 `QA: ____`에 재현 조건·플랫폼·결과·스크린샷/로그 경로를 기록하면 된다.
