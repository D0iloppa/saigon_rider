# 계약 CTA·증빙 및 파트너 관리 UI 수정 보고 (2026-09-09)

## 결과

### 계약 CTA

- 공통 판정 `reviewStatus === 'APPROVED' && subscriptionStatus === 'pending_payment'`만 계약 행동으로 분류한다.
- `BizManage` 우선순위 카드/hero/행 CTA와 `BizAdDetail` footer가 같은 판정을 사용한다.
- `PENDING`·`REJECTED` + `pending_payment`는 계약 API를 부르지 않고 상세로 이동한다. 서버의 `APPROVED` 게이트는 유지했다.
- 알려진 409(미승인, 이미 진행 중)는 ko/en/vi 문구로 표시하고 나머지는 공통 실패 문구로 제한했다.

### 계약 증거와 결제 복귀

- 랜딩에 있던 ko/en/vi 계약 문구를 의미 변경 없이 서버 v2 canonical 문구로 옮겼다. 계좌이체만 전제한 별도 서버 문구는 제거해 현재 카드/계좌 rail과 모순되지 않게 했다.
- GET은 locale별 문안·version·SHA-256과 VND/KRW 기간별 quote를 반환한다. 미지원 locale은 `vi`로 fallback한다.
- 새 랜딩은 실제 표시받은 문안 version/hash, locale, 선택 기간의 VND/KRW quote를 accept에 보낸다. 서버 현재값과 다르면 409로 재확인을 요구한다. 언어 변경 중에는 즉시 loading 전환·동의 해제되어 이전 문안 제출을 막는다.
- accept snapshot에 exact text/version/hash/locale과 기존 가격/기간 정보를 저장한다. 이미 서명된 snapshot은 재accept나 locale 변경으로 바꾸지 않는다.
- 호환을 위해 새 presented 필드는 optional이다. 따라서 구형 클라이언트는 TOCTOU 검증 없이 기존 방식으로 accept할 수 있다는 한계가 남는다.
- Toss V2 legacy payment-window SDK는 유지했다. 공식 quick reference대로 successUrl의 `paymentKey/orderId/amount`를 서버 확인하고 failUrl은 confirm하지 않는다. 결제 복귀 실패에는 사용자가 직접 누르는 controlled retry를 추가했다.
- rail 최종 Toss API 오류는 구조화 502, transport timeout/연결 오류는 retry 가능한 503으로 매핑했다.

공식 확인: https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference

### 가격표·내 소식 관리 UI

- 두 화면에 목적·등록 건수·주행동 hero와 명시적인 목록 섹션을 추가했다.
- 가격표는 품목/가격 위계(`num`, locale 포맷), 목록/등록 폼 경계, 텍스트 삭제 액션과 삭제 확인을 제공한다.
- 내 소식은 이미지 fallback·제목·2줄 미리보기, 내용 관리/삭제 액션과 삭제 확인을 제공한다.
- 소식 페이지네이션은 전체 건수로 오해하지 않도록 다음 페이지가 있으면 로드된 하한(`20+`)으로 표시한다. 로딩 때 0건을 표시하지 않는다.
- 새로 만진 조회 실패는 빈 상태로 위장하지 않고 오류+재시도로 분리했다.
- 가격 입력 화면은 `native.isNative && kb.visible`일 때 실제 scroll body에 키보드 높이+기본 여백을 적용한다(Android/iOS 공통 overlay 규약).
- sticky 탭은 별도 worker 결과(`bizManageStickyTabs.contract.test.mjs`)가 같은 통합 diff에 포함됐다.

## 검증

- PASS — frontend `npx tsc -b --pretty false`.
- PASS — 변경 화면 scoped ESLint error 0 (최종 남았던 `BizAdDetail` 기존 `any` 2건도 `unknown`으로 정리).
- PASS — CTA callback 행동 테스트 3건: PENDING/REJECTED는 detail only, APPROVED는 contract only. 이는 React DOM 클릭 테스트가 아니라 실제 production dispatcher 함수 호출 테스트다.
- PASS — landing Vitest/RTL 2건: 실제 React 체크박스·이름 입력·submit 클릭으로 presented text/quote 전달, PayReturn 실패 후 retry 버튼 클릭→성공.
- PASS — landing TypeScript `npx tsc --noEmit --pretty false`.
- PASS — backend ruff (`RUFF_CACHE_DIR=/tmp/saigon-ruff`) error 0.
- PASS — ko/en/vi JSON parse 및 flattened key parity 2,429개.
- PASS — `git diff --check`.
- 작성 완료/미실행 — mocked API + 360/390/430 + ko/en/vi 가격/소식 DOM overflow·삭제 확인 E2E. 샌드박스가 Vite listen `EPERM`, Chromium sandbox 생성 `Operation not permitted`라 geometry/클릭 실행은 못 했다.
- 미실행 — `test_ad_contract.py` 실제 DB 테스트. 테스트 DB 연결이 무출력 대기해 90초 뒤 중단했고 반복하지 않았다. 신규 케이스(정확 문안 snapshot, stale 문안/quote 409, locale fallback, 재accept 불변)는 파일에 추가했으나 이 환경에서 DB 실행 증적은 없다.

## 권한/운영

- 커밋·push·배포·운영 DB·실결제 호출 없음.
- Plane은 read-only DNS 확인만 실패(exit 6), 인증키 호출/POST 없음. `UNREGISTERED` 유지.
- supervisor fast reindex 완료(nodes 35,641 / edges 100,338), ADR은 기존 `no_adr` 상태 유지.
