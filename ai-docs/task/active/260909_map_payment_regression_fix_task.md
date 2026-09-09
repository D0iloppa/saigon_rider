# 지도·광고 계약/결제 회귀 수정 (2026-09-09)

## 요청과 목표

사용자 감사에서 확인된 세 lane을 최소 변경으로 교정한다.

1. 지도 위치 실패 안내/복귀 상태를 실제 폴백 동작과 일치시킨다.
2. 광고 결제 상태기계·운영 화면·Toss 복귀 흐름의 회귀를 교정한다.
3. 광고 계약 CTA 자격과 표시를 서버의 `APPROVED` 게이트와 일치시키고, 사용자가 실제 본 버전 계약문과 locale을 계약 증거에 보존한다.

성공 기준은 각 lane의 재현 테스트가 수정 전 실패하고 수정 후 통과하며, 기존 결제/계약 호환 테스트가 유지되는 것이다.

## 감사 근거와 범위

- 지도 lane: 위치 실패 결과가 `all/null`로 수렴하고 저장 viewport가 Bến Thành/도심 기본값보다 우선해, 실패 뒤 기준점과 복귀 상태가 일관되지 않는 회귀.
- 결제 lane: 결제 상태 전이/대조/관리자 계약 화면 및 Toss 성공·실패 복귀의 재시도·메시지 회귀.
- 계약 UI lane: `BizManage`가 `subscription_status=pending_payment`만 보고 계약 CTA를 노출해 `review_status=PENDING` 광고에서 서버 `409 Ad is not approved yet`를 유발. `BizAdDetail`까지 동일 자격 규칙이 필요.
- 계약 증거 lane: 랜딩은 locale별 `content.ts` 문구를 표시하지만 서버 snapshot은 별도 서버 문구를 저장해 표시 문구와 증거가 달라질 수 있음. 이미 서명된 snapshot은 변경하지 않는다.

## 모델 라우팅

- 감사 3개 lane(지도·결제·계약 UI/증거)은 모두 T3 등급 구현 작업이며 `gpt-5.6-sol`, effort `medium` worker로 배정한다. 기존 구조 안의 상태 회귀를 수술적으로 고치고 교차 테스트하는 범위에 적합하다.
- 메인 supervisor는 범위·인터페이스 조정, 변경 리뷰, 통합 검증과 최종 종합만 담당한다.

## T3 구현 원칙과 검증

- 공통 계약 CTA eligibility/presentation은 `review_status === 'APPROVED'`와 계약 가능한 subscription 상태를 함께 본다. 서버 `APPROVED` 게이트는 완화하지 않는다.
- PENDING/REJECTED 광고는 계약 링크를 호출하지 않고 광고 상세/심사 상태로 안내한다.
- 알려진 서버 오류는 locale 키로 표현하고, 알 수 없는 오류만 기존 공통 fallback을 쓴다.
- 서버가 내려주는 versioned `contract_text`를 랜딩 canonical 표시로 사용하고, accept 요청 locale을 이용해 같은 문구·버전·locale을 새 snapshot에 저장한다.
- 기존 snapshot이 있는 계약은 최초 증거를 유지한다. 법률적 완결성을 주장하거나 새 조항/정책을 만들지 않는다.
- 행동 테스트: PENDING+pending_payment 클릭이 상세로 이동하며 계약 API를 부르지 않음, APPROVED+pending_payment만 계약 링크 호출, locale별 표시문과 저장 snapshot 일치, 재accept 불변.

## 권한·제약

- 로컬 workspace 파일과 테스트만 수정·실행한다. 커밋·push·배포하지 않는다.
- 운영 DB/실결제/운영 승인/웹훅 호출을 하지 않는다. 비밀값을 출력하지 않는다.
- 스키마 변경이 필요하면 먼저 논의하며, 현재 `AdContract.snapshot` JSON을 재사용하는 범위에서 해결한다.
- Toss 공식 문서로 현재 SDK 의미를 확인하되 지원 중인 V2 SDK를 불필요하게 마이그레이션하지 않는다.
- Plane/dev-context는 정상 추적 범위의 안전한 접근만 시도한다. timeout/네트워크/권한 실패 시 `UNREGISTERED`로 기록하며 우회하거나 키를 노출하지 않는다.

## 추적 상태

- Plane/dev-context: `UNREGISTERED` — supervisor의 read-only HEAD 확인이 DNS 실패(`Could not resolve host`, exit 6)했고 인증키 호출/POST는 수행하지 않았다. 운영 `__DEV` DB mutation도 수행하지 않았다.
- 배포: 금지/미수행.
- codebase-memory: supervisor가 fast reindex 완료(nodes 35,641 / edges 100,338). ADR은 전후 모두 기존 빈 상태(`no_adr`).

## 추가 승인 UI 범위 (2026-09-09)

- `BizPrices`: 목적·등록 건수·주 행동을 헤더에 모으고, 품목명/가격 위계와 목록/등록 폼 경계를 명확히 한다. 기존 CRUD/API는 유지한다.
- `BizNews`: 이미지·제목·미리보기 중심 카드와 명시적 관리 액션, 삭제 확인을 제공한다. 빈 상태 과대 여백을 줄이고 기존 CRUD/API는 유지한다.
- `BizManage`: 가게 identity는 스크롤로 사라지되 운영/성과 탭 행만 기존 TopBar 바로 아래 sticky로 유지한다. 두 탭에서 동일하며 새 UI 라이브러리는 도입하지 않는다.
- 검증: ko/en/vi 키 패리티, keyboard/native 규약, 360/390/430 폭 렌더, mocked API CRUD 클릭, 실제 scroll ancestor 기준 sticky geometry를 확인한다.
