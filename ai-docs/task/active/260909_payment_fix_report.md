# 결제 레일 감사 수정 보고 (2026-09-09)

## 범위와 가정

- 범위: `backend/app/services/ad_payments/**`, `backend/app/routers/admin_api/biz_contracts.py`, 결제 테스트.
- 스키마·공개 API 형태는 유지했다. 실결제, 운영 DB 쓰기, 배포는 수행하지 않았다.
- `toss_mode() == "live"`는 기존 반환값 호환을 위해 이름을 유지하며, 의미는 “실제 Toss HTTP gateway”다. 개발 환경의 test 키도 이 모드를 사용한다.

## 반영 내용

1. `TossCardRail`에 PSP Payment 공통 검증을 추가했다.
   - 입금 원장 생성 전 `status=DONE`, `paymentKey`, 계약 소유 `orderId`, 계약 스냅샷의 `currency`와 `totalAmount`를 모두 대조한다.
   - confirm 정상 응답, `ALREADY_PROCESSED_PAYMENT` 복구, lookup, 웹훅 재조회가 같은 검증기를 통과한다.
   - successUrl의 요청 금액 선검증은 그대로 유지하면서 PSP 조회 결과도 별도로 검증한다.
2. confirm의 모호한 실패를 안전하게 복구한다.
   - `ALREADY_PROCESSED_PAYMENT`, HTTP 5xx, `httpx.TransportError`일 때 같은 `paymentKey`를 한 번 조회한다.
   - 조회 결과가 없거나 계약 스냅샷과 다르면 원장/승인을 진행하지 않는다. 명확한 4xx는 복구 대상으로 삼지 않는다.
3. 웹훅 조회를 2회에서 1회로 줄였다.
   - 서명 없는 웹훅 본문의 `paymentKey`만 추출하고 Toss API를 한 번 호출한다.
   - 조회한 객체에서 계약을 찾은 뒤 공통 검증기를 통과한 동일 객체만 원장으로 보낸다.
4. 키 환경을 fail-closed로 변경했다.
   - `production|prod`는 `live_ck_` + `live_sk_`, 개발 화이트리스트는 `test_ck_` + `test_sk_`만 허용한다.
   - test/live 혼합, 역할 뒤바꿈, 일부 키만 설정, APP_ENV 미설정·오타, 환경과 키 불일치는 `off`다.
   - 현재 프론트가 V2의 legacy `payment()`를 사용하므로 API 개별 연동 키 `ck/sk`만 허용한다. `gck/gsk`는 widgets 계열 키라 받지 않는다.
5. 환불 원장 과대계상을 수정했다.
   - 부분 환불 뒤 `amount_vnd=null`인 “잔여 전액” 요청은 PSP에는 `cancelAmount`를 생략하되, refund 원장에는 관리 API가 계산한 실제 잔여 VND만 기록한다.
   - 취소 응답의 Payment 상태, `paymentKey`, 원결제 금액·통화를 보존·검증한다.
   - `Payment.lastTransactionKey`와 같은 Cancel 객체를 배열 순서에 의존하지 않고 선택한 뒤, 그 객체의 `cancelStatus=DONE`, `transactionKey`, `cancelAmount`, timezone-aware `canceledAt`을 검증한다. 잔여 전액은 성공한 취소 누계가 원청구와 같은지도 확인한다.
   - refund 행의 `charge_snapshot`에는 원청구 `currency/value/payment_key/order_id`를 보존하면서 `lastTransactionKey/cancelAmount/canceledAt/transactionKey/cancelStatus`를 함께 저장한다.
   - refund 원장의 `paid_at`은 원승인 `approvedAt`이 아니라 검증한 실제 취소 `canceledAt`으로 기록한다.
6. 관리자 `DepositRow`에 `charge_snapshot`을 노출해 KRW·카드·PSP 증거를 API 소비자가 확인할 수 있게 했다.
7. 관리자 환불 POST의 네트워크 timeout/transport 오류는 자동 재시도하지 않고 `503` + `retryable=true`로 통제한다. Toss의 명시적 API 오류는 기존처럼 `502`로 반환한다.

## 근거

- [Toss LLM Quick Reference](https://docs.tosspayments.com/guides/v2/get-started/llms-quick-reference): 서버 저장 금액 검증, `Basic base64(secret:)`, confirm 실패 후 조회, 일반 결제 웹훅 재조회, 멱등키, test/live 분리를 확인했다.
- [Toss API 키](https://docs.tosspayments.com/reference/using-api/api-keys): 키는 세트로 사용해야 하며 test/live 혼합이 금지되고, `gck/gsk`와 `ck/sk`의 SDK 용도가 다름을 확인했다.
- [Toss AI 도구 가이드](https://docs.tosspayments.com/guides/v2/get-started/llms-guide): Quick Reference를 가드레일로 삼고 세부 API 문서를 확인하는 공식 흐름을 따랐다.

## 검증 결과

실행 환경:

```text
Python 3.12.13
/home/doil/.local/share/uv/python/cpython-3.12-linux-x86_64-gnu/bin/python3.12
site-packages: /home/doil/.cache/uv/archive-v0/VOB0SQG7neXKgdGy/lib/python3.12/site-packages
```

- `python3.12 -m unittest app.tests.test_ad_toss_config app.tests.test_ad_toss_rail`: **40 tests OK**
- `ruff check --no-cache` (변경 Python 파일): **All checks passed**
- `python3.12 -m py_compile` (변경 Python 파일): **통과**
- `git diff --check`: **통과**
- 추가 회귀: PSP status/orderId/paymentKey/금액/통화 변조, ALREADY, timeout, 5xx, mismatch 복구 거부, 웹훅 단일 조회, Basic trailing colon, key 환경 불일치, refund pending·lastTransactionKey 불일치·취소 증거 누락·금액 변조, cancellation snapshot, remaining-all VND.

## 검증 한계

- Docker socket 접근이 허용되지 않아 PostgreSQL을 쓰는 `test_admin_biz_contracts.py`는 실행하지 못했다. 해당 파일의 회귀는 `400,000 VND` 부분 환불 뒤 `amount_vnd=null` 잔여 전액 환불이 `139,000 VND`만 기록하고 `received_vnd=0`이 되는 조건 및 refund transport timeout이 원장 쓰기 없이 retryable `503`이 되는 조건으로 갱신했다.
- 실 Toss 키·실카드·웹훅·운영 DB는 사용하지 않았다.
- 최종 codebase-memory 재인덱싱은 감독 에이전트가 전체 변경을 모아 수행한다.
