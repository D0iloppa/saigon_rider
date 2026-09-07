# 설계 — 토스페이먼츠 결제 레일 도입: 결제 개시 seam·통화·미배선 동작 (2026-09-07)

> **설계 문서.** 이번 세션 코드 변경: **없음** (문서만). 구현은 §8 티켓으로.
> **상위 결정**: [`260907_biz_ad_payment_contract_adr.md`](260907_biz_ad_payment_contract_adr.md) 최상단 경고 블록(대표 확정 2026-09-07: **결제 레일 = 토스페이먼츠**, 베트남 소비자 → Visa/Master 해외카드 → 토스 → 한국 법인 정산). 그 문서의 "PG 유보·2C2P 검토" 결론은 **대체**됐다(§9 대응표).
> **하위 구현 기반**: [`260907_ad_payment_pipeline_design.md`](260907_ad_payment_pipeline_design.md) — 원장 2테이블·seam-A/B·상태기계·대조·승인·노출은 **그대로 재사용**한다. 이 문서는 그 위에 **seam-C(결제 개시)** 를 얹고 통화 문제를 푼다. 두 문서를 덮어쓰지 않고 §9 에서 어느 결정이 바뀌는지 표로 남긴다.
> 도메인 규칙 SoT: [`context/service-rules.md`](context/service-rules.md) §광고 노출 6(불변식 `active ⇒ paid_until IS NOT NULL`, 쓰기 주체 `approve()` 단일).
> 표기 규약: **[확인]** = 코드·공식 문서로 확인 / **[추정]** = 근거는 있으나 확정 아님 / **[확인 필요]** = 실측·법무·세무·대표 확인 필요. 토스 규격 주장에는 출처 URL 을 붙였다. **API 키·계좌 등 실제 값은 이 문서에 없다.**

---

## 0. 결제 흐름 한 장 요약

**1급 목표(대표)**: *"구현했으나 배선하지 않은 상태"* 와 *"구현하지 않은 상태"* 는 다르다. **API 키가 없는 지금도 결제 파이프라인은 끝까지 돌아야 하고, 키를 받으면 "배선만" 하면 끝이어야 한다.** 배선 지점(⚡)은 셋이다 — seam-A 계좌(기존), seam-B 입금 관측(기존), **seam-C 결제 개시(신설)**. 그 외 계약·원장·대조·승인·노출은 배선 여부와 무관하게 지금 완성한다.

```
 [앱] 광고주            [웹] business.saigon-rider.com (정적 SPA)              [BFF] app.saigon-rider.com                 [어드민]           [공개면]
 ────────────           ────────────────────────────────────────              ─────────────────────────────              ────────           ────────
 "계약하기" ─토큰─▶ ① 계약  기간 1/3/6 선택·동의  →  ad_contracts 1행 (draft→accepted)
   (가격 비노출)          │  스냅샷에 VND 계약금액 + ⚡seam-D: KRW 청구금액(ad_tiers.price_*_krw) 고정
                          ▼
                       ② 결제수단 제시 ── GET /public/ad-contract/{token} 이 rails[] 를 내려준다
                          │   ├ bank_transfer : ⚡seam-A 계좌 3키 있으면 계좌 카드(기존) / 없으면 "준비 중"
                          │   └ toss_card     : ⚡seam-C 토스 2키 있으면 [카드로 결제] 버튼(client_key 포함) / 없으면 버튼 숨김
                          │                     (dev: AD_PAYMENT_TOSS_STUB=1 이면 스텁 게이트웨이로 버튼 활성 — e2e 용)
                          ▼
             ┌── 계좌이체 경로(기존, 무변경) ──────────────┐   ┌── 카드 경로(신설) ───────────────────────────────────────────────┐
             │ 광고주 은행앱 이체, 적요에 SGR-코드            │   │ ③ SPA 가 토스 SDK requestPayment({orderId=SGR-코드-attempt,        │
             │ 관리자 수동 입금건 등록(어댑터 manual)          │   │      amount:{currency:KRW, value:스냅샷 KRW}, useInternationalCardOnly}) │
             │                                              │   │    → 토스 결제창(외부 브라우저 안) → successUrl(business.) 로 복귀     │
             │                                              │   │ ④ SPA → POST /public/ad-contract/{token}/checkout/confirm             │
             │                                              │   │    BFF: orderId·amount 를 스냅샷과 대조 → 토스 confirm(시크릿 키)      │
             │                                              │   │    실패·타임아웃 → GET /v1/payments/{paymentKey} 재조회 / 웹훅 복구    │
             └──────────────┬───────────────────────────────┘   └──────────────┬─────────────────────────────────────────────────┘
                            ▼                                                  ▼
                       ⑤ ingest_deposit(DepositObservation)  ── seam-B 포트(무변경). 카드는 source='toss', source_ref=paymentKey(멱등)
                          │  reconcile → paid   (카드는 금액이 구성상 정확 일치)
                          ▼
                       ⑥ 승인 ── 계좌이체: 관리자 approve(기존)  /  카드: 코어가 즉시 approve(actor='system:toss') — §3-3 결정
                          │  approve() 만이 ad.paid_until / subscription_status 를 쓴다(불변식 유지)
                          ▼
                       ⑦ 노출 ── ad_gating.launching_ad_conditions (무변경)
                            (토스 웹훅 PAYMENT_STATUS_CHANGED 는 ⑤ 로 재진입 — 같은 paymentKey 라 두 번 늘지 않는다)
```

**배선 지점 요약**

| seam | 무엇 | 배선 수단 | 미배선 동작 |
|---|---|---|---|
| A 계좌(기존) | 은행명·계좌·예금주 | `.env` 3키(compose 배선 완료) | 계좌 카드 "준비 중", 계약은 `accepted` 유지 |
| B 입금 관측(기존) | `DepositObservation` → `ingest_deposit()` | 어댑터 registry | manual 만 |
| **C 결제 개시(신설)** | 결제창 호출 → confirm → 웹훅 | `.env` 2키 `AD_PAYMENT_TOSS_CLIENT_KEY`/`AD_PAYMENT_TOSS_SECRET_KEY` + compose 2줄 | 카드 버튼 숨김. dev 스텁으로 e2e 가능 |
| **D 청구 통화(신설)** | tier×기간 KRW 확정가 | `ad_tiers.price_{1,3,6}m_krw` 컬럼(마이그레이션으로 시드) | NULL 이면 카드 버튼 숨김(계좌만) — 무료·0원 계약 방지 |

**운영 키를 받았을 때 바뀌는 것**: `.env` 값 2개 + 토스 개발자센터 설정(웹훅 URL·성공/실패 도메인). **코드 파일 0개**(§5-4 증명).

---

## 1. 현재 구현 실측 [확인] — 재설계 전에 뭐가 있나

| 영역 | 상태 | 근거 |
|---|---|---|
| 원장 | `ad_contracts`(계약, `payment_code` UNIQUE, `contract_snapshot JSONB`, 기간·승인자) · `ad_deposits`(계약 1:N, `contract_id NULL` 허용, `kind deposit/refund`, `UNIQUE(source, source_ref) WHERE source_ref IS NOT NULL`) · `ad_tiers.price_3m_vnd/price_6m_vnd` 시드 완료 | `database/init/228_ad_contracts_deposits.sql`, `models.py:1088-1140` |
| seam-B 포트 | `DepositObservation(amount_vnd, paid_at, memo_raw, payer_name, bank_ref, source: Literal["manual","csv","bank_feed"], source_ref, kind, payment_code_hint)` + `ingest_deposit()` — 코드 추출(`payment_code_hint` 우선, 없으면 `memo_raw` 정규식 `SGR[0-9A-Z]{7}`)·멱등 삽입(사전 조회 + IntegrityError 재조회 2중)·대조. **`source` 가 Literal 3종으로 닫혀 있다** → 토스는 값 1개 추가 필요 | `services/ad_payments/port.py`, `payment_code.py:22,78` |
| 상태 전이 | `contracts.py` 5함수(`accept/issue_instructions/approve/cancel/close_refunded`) + `compute_period`. `approve()` 가 `ad.paid_until`·`subscription_status` 를 한 호출 안에서 함께 대입 | `services/ad_payments/contracts.py` |
| 대조 | `reconcile_contract()` 순수함수, 플래그 `overpaid/check_payer/duplicate_suspect` 는 저장 안 함 | `reconcile.py` |
| 계약 웹 API | `POST /biz/ads/{id}/contract-link`(앱 세션) · `GET /public/ad-contract/{token}`(GET 시 `issue_instructions` 멱등) · `POST …/accept {months, signer_name}`. 응답에 `bank: null` = 미배선. 계약 문안은 서버 상수 `v1` | `routers/ad_contract.py` |
| 관리자 API | 목록·상세(대조·예상기간)·입금건 등록(manual)·미매칭 등록/배정·승인(stale 가드)·취소·환불 종결(최신 계약이면 `paid_until` 되돌림)·`payment-wiring`(키 이름만) | `routers/admin_api/biz_contracts.py` |
| 노출 게이트 | `active ∧ paid_until ≥ 갱신유예` ∨ `pending_payment ∧ starts_at ≥ 신규유예` ∨ 하우스 광고 | `services/ad_gating.py` |
| seam-A | `.env.example` 3키 + compose `bff.environment` 3줄 배선 완료 | `.env.example:191-193`, `docker-compose.yml:646-648` |
| **미구현** | **P1-5 어드민 계약 화면 없음**(`admin-frontend/src/pages/biz/` 에 `BizContract*` 부재) · **P1-6 계약 웹페이지가 구 API 그대로**(`apply/Index.tsx` 가 `bank_transfer_info`·`monthly_price_vnd` 사용, `adContractApi.ts` 타입 구버전) · P1-7 앱 배지 미구현 | `ls admin-frontend/src/pages/biz`, `landing/apps/client/src/pages/apply/Index.tsx:210-212`, `lib/adContractApi.ts` |
| 테스트 관례 | mock db·순수함수 위주, e2e `test_ad_payment_pipeline_e2e.py`(미배선) | `backend/app/tests/test_ad_*` 12파일 |
| 별건 결함(수정 안 함) | `BIZ_PORTAL_BASE_URL` 이 `.env.example:30` 에 있으나 **compose `bff.environment` 에 없다** → 컨테이너에서는 항상 코드 기본값. seam-A 와 같은 함정. 본 설계의 successUrl/failUrl 이 이 값을 쓰므로 P2-3 에서 함께 배선 | `grep BIZ_PORTAL_BASE_URL docker-compose.yml` → 0건 |

**P1-5/P1-6 이 아직 없다는 점이 이 설계의 이점이다** — 계좌 전용으로 만들고 나서 카드를 덧붙이는 대신, 처음부터 `rails[]` 를 소비하는 화면으로 한 번에 만든다(§8 티켓 관계).

---

## 2. 토스페이먼츠 규격 — 확인한 사실

| # | 사실 | 판정 | 출처 |
|---|---|---|---|
| T-1 | v2 SDK `payment.requestPayment()` 파라미터: `method:"CARD"`, `amount:{currency, value}`, `orderId`(6~64자, 영문 대소문자·숫자·`-`·`_` 만), `orderName`(≤100자), `successUrl`, `failUrl`, `card.useInternationalCardOnly:true` → 한·영·중·일 다국어 결제창 | [확인] | https://docs.tosspayments.com/en/integration · https://docs.tosspayments.com/guides/v2/payment-window/integration-international |
| T-2 | **`CARD` 의 `currency` 는 `KRW` 만** — "`FOREIGN_EASY_PAY` or PayPal, currently only accepts `USD`. All other payment methods only accept `KRW`" | [확인 — 영문 SDK 레퍼런스] | https://docs.tosspayments.com/en/integration |
| T-3 | 해외카드는 **원화(KRW) 청구가 기본**. 다통화(USD·JPY)는 **별도 계약**, **MID 하나 = 통화 하나**. | **[확인 2026-09-07] 상충 해소 — 카드결제창에서 USD/JPY 도 가능하다.** 결제취소 API 문서가 명시: "일반결제는 KRW, USD, JPY 를 지원합니다. 해외 간편결제(PayPal)는 USD만 지원합니다." (승인 시 currency 도 동일 정책). 실무: 해외 발행카드(VISA/MASTER/JCB) 다통화(USD/JPY)는 **별도 계약 필요**, 지원통화·조건은 영업팀(1544-7772) 문의. | https://docs.tosspayments.com/guides/v2/learn/foreign-payment · https://docs.tosspayments.com/resources/glossary/international-payment |
| T-4 | 다국어 결제창은 `currency:"KRW"` 로 두고 **USD 예상 금액을 결제창에 표시**(`card.showEstimatedAmount` 로 숨김 가능) | [확인] | https://docs.tosspayments.com/guides/v2/payment-window/integration-international |
| T-5 | 성공 리다이렉트 쿼리 `paymentKey, orderId, amount, paymentType`; 실패 `code, message, orderId`(사용자 취소 `PAY_PROCESS_CANCELED` 는 orderId 없음). **서버는 쿼리 `amount` 가 요청 금액과 같은지 반드시 확인** | [확인] | https://docs.tosspayments.com/guides/v2/payment-window/integration · https://docs.tosspayments.com/guides/v2/payment-widget/integration |
| T-6 | 승인 `POST /v1/payments/confirm {paymentKey, orderId, amount}`, `Authorization: Basic base64(secretKey + ":")`. **결제 요청 후 10분 이내 승인** 필수, 지나면 `NOT_FOUND_PAYMENT_SESSION`. 중복 승인은 `ALREADY_PROCESSED_PAYMENT` | [확인] | https://docs.tosspayments.com/reference · https://docs.tosspayments.com/reference/error-codes |
| T-7 | `Idempotency-Key` 헤더 — 모든 POST 에 사용 가능, ≤300자, 15일 유효, 같은 키 재요청은 첫 응답 재전송 | [확인] | https://docs.tosspayments.com/reference/using-api/idempotency-key |
| T-8 | Payment 객체: `paymentKey`(≤200자)·`orderId`·`status`(`READY/IN_PROGRESS/DONE/CANCELED/PARTIAL_CANCELED/ABORTED/EXPIRED…`)·`totalAmount`·`currency`·`method`·`card{issuerCode, cardType, ownerType, number(마스킹)}`. 조회 `GET /v1/payments/{paymentKey}`, `GET /v1/payments/orders/{orderId}` | [확인] | https://docs.tosspayments.com/reference |
| T-9 | 취소 `POST /v1/payments/{paymentKey}/cancel {cancelReason, cancelAmount?}` — `cancelAmount` 생략 = 전액, 지정 = **부분취소**. 멱등키 권장 | [확인] | https://docs.tosspayments.com/reference |
| T-10 | 웹훅 `PAYMENT_STATUS_CHANGED` 페이로드 `{eventType, createdAt, data: Payment}`. **서명 검증 없음**(`tosspayments-webhook-signature` 는 `payout.changed`/`seller.changed` 만). 헤더 `tosspayments-webhook-transmission-id/-retried-count/-time`. 200 을 10초 내 응답, 미응답 시 **최대 7회 재전송(1·4·16·64·256·1024·4096분)**. 웹훅은 **MID 별** 등록, 공개 URL 필수 | [확인] | https://docs.tosspayments.com/reference/using-api/webhook-events · https://docs.tosspayments.com/guides/v2/webhook |
| T-11 | 키: `test_`/`live_` 접두, 클라이언트 키(`ck`/`gck`, 브라우저 노출용) · 시크릿 키(`sk`/`gsk`, 서버 전용 — "GitHub, 클라이언트 코드 등 외부에 보이는 곳에 추가하지 마세요"). **가맹 신청 완료 전에는 "개발 연동 체험 상점의 일부 테스트 키"만** 사용 가능 | [확인] | https://docs.tosspayments.com/reference/using-api/api-keys |
| T-12 | 해외카드 지원: Visa·Mastercard·JCB·AMEX·Diners·Discover·UnionPay. 3DS(Visa/MC/JCB/AMEX). **해외 차지백 분쟁 기간 최대 180일**, 가맹점 입증 부담 ↑. 해외 정산 주기는 국내보다 길다. 환율 변동이 부분·지연 취소 환불액에 영향 | [확인] | https://docs.tosspayments.com/resources/glossary/international-payment |
| T-13 | 테스트 키로 해외카드(Visa/Master/JCB 테스트 카드번호) 결제 흐름 테스트 가능 | [확인] | https://docs.tosspayments.com/guides/v2/learn/foreign-payment |
| T-14 | 테스트 키로 **웹훅 등록·수신**이 가능한지(테스트 MID 에 웹훅 메뉴가 열리는지) | **[확인 필요 — 개발자센터 실측]** | — |
| T-15 | 해외카드(`useInternationalCardOnly`) 사용에 **해외결제 계약 옵션이 MID 에 켜져 있어야** 하는지(ADR 의 "가입비·심사" 항목과 별개 추가 계약인지) | **[확인 필요 — 담당 이재훈 대표 문의]** | ADR 최상단 블록 |

---

## 3. A. 결제 개시 seam-C — 포트와 두 어댑터

### 3-1. 왜 seam-B 만으로 안 되는가

seam-B(`DepositObservation` → `ingest_deposit`)는 **"이미 들어온 돈의 관측"** 이라는 단방향 포트다. 계좌이체·CSV·은행 피드는 전부 "밖에서 일어난 입금을 뒤늦게 아는" 소스라 여기 맞는다. 토스는 다르다 — 우리가 **결제를 시작**(orderId·금액을 우리가 정해 결제창을 열고)하고, **우리가 승인**(confirm 호출)해야 돈이 움직인다. 즉 "입금 관측" **앞단**에 왕복 대화가 있다. 이 앞단을 seam-B 에 억지로 밀어넣으면 `ingest_deposit` 이 HTTP 를 호출하게 되고(코어 오염), 계좌이체 어댑터엔 없는 개념(orderId·confirm)이 포트에 섞인다.

그래서 **seam-C 는 seam-B 의 상류에 있는 별도 포트**다. seam-C 의 산출물은 오직 `DepositObservation` 하나이고, 그것을 seam-B 에 넣는다. **원장·대조·승인·노출은 seam-C 가 무엇인지 모른다.**

### 3-2. 포트 정의 `PaymentRail` — 위치 `backend/app/services/ad_payments/rails/`

```python
# services/ad_payments/rails/base.py   (신규)
@dataclass(frozen=True)
class RailOffer:
    """계약 페이지가 광고주에게 보여줄 결제수단 1개. 값이 아니라 '무엇을 보여줄지'."""
    rail: str                                   # "bank_transfer" | "toss_card"
    wired: bool                                 # 배선됐는가 (미배선이면 아래 필드는 전부 None/비어 있음)
    instructions: dict | None = None            # bank_transfer: {name, account_no, holder, payment_code, due_at}
    checkout: dict | None = None                # toss_card: {client_key, order_id, order_name, amount:{currency,value}, success_url, fail_url, customer_name}

@dataclass(frozen=True)
class CheckoutResult:
    """결제 개시가 있는 레일이 confirm/웹훅/재조회로 얻은 확정 결과. seam-B 로 넘길 관측 1개 + 원본 스냅샷."""
    observation: DepositObservation             # source=rail 키, source_ref=PSP 고유키(멱등), amount_vnd=계약 VND 금액
    charge_snapshot: dict                       # {currency, value, psp_payment_key, psp_order_id, approved_at, card:{issuer_code,type,masked}, raw_status}
    already_final: bool                         # PSP 쪽에서 이미 DONE 이었나(중복 confirm 등) — 로그용

class PaymentRail(Protocol):
    key: str
    def wired(self) -> bool: ...                           # 이 레일의 배선(.env 키/컬럼) 충족 여부
    def offer(self, contract, ad, tier, *, now) -> RailOffer: ...
    # ── 아래 셋은 "결제 개시가 있는 레일"만 의미가 있다. 없는 레일은 RailNotSupported 를 던지는 null-object.
    async def confirm(self, contract, *, params: dict) -> CheckoutResult: ...      # 성공 리다이렉트 파라미터로 승인
    async def lookup(self, contract, *, ref: str) -> CheckoutResult | None: ...   # 재조회(복구·어드민 재동기화)
    async def refund(self, contract, *, ref: str, amount_vnd: int | None, reason: str) -> CheckoutResult: ...
    def parse_webhook(self, headers, body: bytes) -> str | None: ...              # 페이로드 → 재조회할 ref(paymentKey). 못 믿으면 None

class RailNotSupported(Exception): ...
```

**"결제 개시가 없는 어댑터를 같은 포트로 표현하는 법" = null-object.** `supports_checkout` 같은 능력 플래그를 따로 두지 않는다 — `offer()` 가 `instructions`(계좌) 를 채우느냐 `checkout`(결제창) 을 채우느냐가 이미 능력 표현이고, `confirm/lookup/refund/parse_webhook` 는 계좌 레일에서 `RailNotSupported` 를 던진다. 호출부(라우터)는 레일 키로 분기하지 않고 예외를 4xx 로 바꾸기만 한다. 플래그를 두면 호출부에 `if rail.supports_checkout:` 분기가 퍼지고, 그 분기 하나하나가 나중에 세 번째 레일에서 빠뜨릴 지점이 된다.

### 3-3. 두 어댑터가 같은 포트에 꽂히는 증명

| 메서드 | ① `bank_transfer` (`rails/bank_transfer.py`) | ② `toss_card` (`rails/toss_card.py`) |
|---|---|---|
| `wired()` | `config.bank_wiring_ready()` (기존 seam-A 그대로) | `config.toss_wiring_ready()` = 클라·시크릿 키 둘 다 있음 **또는** dev 스텁 활성(§5-1) — **그리고** `tier.price_{months}m_krw IS NOT NULL`(seam-D) |
| `offer()` | `instructions={bank 3값, payment_code, due_at}`; 미배선이면 `wired=False` 만. 부수효과 없음(기존 `issue_instructions` 는 라우터가 GET 에서 계속 호출) | `checkout={client_key, order_id, order_name, amount:{currency:"KRW", value: 스냅샷 KRW}, success_url, fail_url, customer_name: signer_name}`; `order_id = f"{payment_code}-{attempt}"`(§3-5). **시크릿 키는 절대 포함하지 않는다** |
| `confirm(params)` | `RailNotSupported` | ① `params.orderId` 에서 `payment_code` 추출 → 계약 일치 검사 ② `params.amount == snapshot.charge.value` 검사(T-5) ③ 게이트웨이 `POST /v1/payments/confirm`(`Idempotency-Key: paymentKey`) ④ 응답 Payment → `CheckoutResult`. `ALREADY_PROCESSED_PAYMENT` 면 `lookup` 으로 대체(이미 DONE 이면 정상 결과, `already_final=True`) |
| `lookup(ref)` | `RailNotSupported` | `GET /v1/payments/{paymentKey}` → `status=="DONE"` 이면 `CheckoutResult`, 아니면 None. **웹훅 검증도 이것으로 한다**(T-10 서명 없음) |
| `refund(ref, amount, reason)` | `RailNotSupported`(환불 송금은 사람이 은행에서 — 기존 manual refund 입금건 등록 유지) | `POST /v1/payments/{paymentKey}/cancel {cancelReason, cancelAmount?}`(`Idempotency-Key: f"{paymentKey}:refund:{n}"`) → `observation.kind="refund"`, `source_ref=f"{paymentKey}:cancel:{transactionKey}"` |
| `parse_webhook` | `RailNotSupported` | `eventType=="PAYMENT_STATUS_CHANGED"` 이고 `data.paymentKey` 있으면 그 키 반환. **페이로드의 상태·금액은 신뢰하지 않고** 반환된 키로 `lookup` 한다 |
| 산출물 | (관측은 관리자가 manual 어댑터로 등록 — seam-B) | `DepositObservation(source="toss", source_ref=paymentKey, amount_vnd=contract.amount_vnd, paid_at=approvedAt, memo_raw=orderId, payer_name=signer_name, bank_ref=f"{card.issuerCode} {card.number}", payment_code_hint=payment_code)` |

두 어댑터의 교집합은 `offer()` 하나고, 차집합은 전부 "결제 개시가 있는가" 한 축이다. 세 번째 레일(예: PayPal, 향후 다통화 MID)이 와도 같은 다섯 메서드로 표현된다 — 다만 **지금 만들지 않는다**.

**HTTP 경계는 어댑터 안에서 한 번 더 갈라진다** — `TossGateway` 프로토콜(`confirm/get_payment/cancel` 3메서드, httpx 0.27 기존 의존성)과 구현 2개: `HttpTossGateway`(진짜)·`StubTossGateway`(dev, §5-1). 어댑터 로직(orderId 파싱·금액 대조·매핑·멱등키)은 게이트웨이가 무엇이든 동일하므로 키 없이 전부 테스트된다.

### 3-4. 토스 결제 성공을 기존 `ad_deposits` 행으로 기록하는 법

| `ad_deposits` 컬럼 | 값 | 이유 |
|---|---|---|
| `source` | `'toss'` | 어댑터 식별. `port.DepositObservation.source` Literal 에 `"toss"` 추가(Literal 값 1개 — 코어 수정은 이것뿐) |
| `source_ref` | **`paymentKey`** | 토스가 결제 1건에 부여하는 고유키(≤200자, T-8). confirm 응답과 웹훅 `data.paymentKey` 가 같으므로 **두 경로가 같은 멱등키**를 만든다 → `UNIQUE(source, source_ref)` 가 confirm/웹훅 레이스와 웹훅 7회 재전송을 전부 흡수. `orderId` 를 쓰지 않는 이유: orderId 는 우리가 만들고 재시도마다 바뀔 수 있어(§3-5) "돈이 한 번 움직였다"의 식별자가 아니다 |
| `amount_vnd` | `contract.amount_vnd` (계약 VND 액면) | 원장·대조가 VND 정수로 동작하고, 카드 결제는 계약금액 전액이 구성상 일치하므로 액면 그대로. **실제 청구 KRW 는 `charge_snapshot`** |
| `paid_at` | Payment `approvedAt`(aware) | 은행 거래시각에 해당 |
| `memo_raw` | `orderId`(예: `SGR-7K3M9Q2-1`) | 기존 코드 추출 정규식이 그대로 먹는다(`SGR[0-9A-Z]{7}` — 뒤의 `-1` 은 무시됨). `payment_code_hint` 도 함께 넣어 이중 안전 |
| `payer_name` | `contract.signer_name`(우리가 `customerName` 으로 넘긴 값) | 토스는 카드 명의자 이름을 주지 않는다. `check_payer` 플래그는 금액 불일치 조건이 함께 필요해 카드에선 발화하지 않음 |
| `bank_ref` | `"{card.issuerCode} {card.number}"`(마스킹 번호) | 분쟁 시 카드 특정. PAN 원문은 토스가 주지 않으므로 저장 위험 없음 |
| `recorded_by` | `'rail:toss'` | 기존 `'adapter:<provider>'` 관례 |
| `charge_snapshot` **(신설 컬럼, JSONB NULL)** | `{currency:"KRW", value:10900, psp:"toss", payment_key, order_id, approved_at, method, card:{issuer_code, card_type, owner_type, number}, raw_status:"DONE", fx_basis:{vnd:199000, krw_price_col:"price_1m_krw"}}` | **분쟁·환불·회계에 필요한 "실제로 얼마가 어떤 통화로 움직였나"**. `note` TEXT 에 JSON 문자열로 넣는 대안은 조회·검증이 불가해 배제. 계좌이체 행은 NULL — 기존 코드 무영향 |

**새 원장을 만들지 않는다.** 추가되는 것은 `ad_deposits` 에 nullable 컬럼 1개, `ad_contracts` 에 컬럼 0개(청구 KRW 는 이미 있는 `contract_snapshot` 에 필드로 — §4-3), `ad_tiers` 에 KRW 가격 컬럼 3개(§4-3).

### 3-5. `orderId` 규칙

- 형식 `SGR-XXXXXXC-<attempt>` — `payment_code`(11자) + `-` + 시도 번호(1~). 총 ≤ 15자, 허용 문자셋(영숫자·`-`) 안 [확인 T-1].
- **시도 번호가 필요한 이유**: 결제창에서 인증 실패·사용자 취소 후 같은 `orderId` 로 재요청이 허용되는지 토스 문서가 명시하지 않는다 **[확인 필요 — T-6 `NOT_FOUND_PAYMENT_SESSION`·`ALREADY_PROCESSED_PAYMENT` 동작 실측]**. 시도마다 새 orderId 를 쓰면 이 불확실성이 사라진다. 시도 번호는 저장하지 않는다 — `offer()` 가 `attempt = (해당 계약의 toss 입금건 수 + 1)` 가 아니라 **호출 시각 기반 4자리(`now.strftime("%H%M")`)** 도 아니고, 단순히 **매 `offer()` 호출마다 1~9999 난수**. 계약은 `payment_code` 로 특정하므로 attempt 는 유일성만 필요하다.
- 계약 특정은 항상 `payment_code.extract_codes(orderId)` → `ad_contracts.payment_code` 조회. 토큰의 계약과 다르면 400(다른 사람 결제를 이 계약에 붙이려는 시도).

### 3-6. 자동 승인 결정 — **카드(toss) 는 자동 승인한다**

| | 계좌이체(manual) | 카드(toss) |
|---|---|---|
| 금액 정확성 | 사람이 잘못 보낼 수 있다(부족·초과·분할) | **구성상 정확** — 우리가 `amount` 를 정하고, 토스가 그 금액만 승인하고, confirm 전에 우리가 다시 대조(T-5) |
| 입금자 신원 | 적요 코드·입금자명으로 사람이 확인 | 계약 토큰(앱 세션·광고 소유 검증을 거쳐 발급) 안에서만 결제창이 열린다 |
| 사람 판단의 가치 | 있음(오입금·중복·타 계약 코드) | **없음** — 관리자가 볼 것은 "토스가 DONE 이라 했다" 뿐이다. 승인 지연은 카드 결제의 유일한 장점(즉시성)을 없앤다 |
| 결정 | **사람 승인 유지**(기존) | **`ingest` 직후 코어가 `approve(actor="system:toss")`** |

**경계 유지**: 자동 승인은 **어댑터가 아니라 코어**(`services/ad_payments/checkout.py::complete_checkout()`)가 한다 — 어댑터는 `CheckoutResult` 를 돌려줄 뿐 `approve()`·`paid_until`·상태를 만지지 않는다(기존 규칙 그대로). `complete_checkout()` 은 ① `ingest_deposit(observation)` ② 결과가 `duplicate=False` 이고 대조 `status=="paid"` 이고 `contract.status ∈ {accepted, awaiting_payment, paid}` 일 때만 ③ `contracts.approve(contract, ad, actor="system:toss", now)` ④ audit `BIZ_AD_CONTRACT_APPROVE`(detail 에 `auto=True, rail="toss", payment_key`) ⑤ 기존 알림 `biz.ad_reviewed/SUBSCRIPTION_ACTIVE`. 자동 승인 대상 소스는 `constants.AUTO_APPROVE_SOURCES = ("toss",)` 한 튜플로 고정한다 — 파이프라인 문서 D-E("정확 일치 자동승인")는 **은행 피드(bank_feed) 에 대해서는 여전히 미결**이고, 그 튜플에 값을 하나 더 넣는 것이 D-E 결정의 구현 전부다.

`partially_paid` 는 카드 경로에서 나올 수 없다(전액 단건). 만약 나오면(초과 입금 후 카드 결제 등 혼합) 자동 승인 조건을 통과하지 못하고 관리자 화면에 남는다 — 안전한 방향으로 실패.

### 3-7. 은행 API(SePay 등) 어댑터는 계속 필요한가 — **병존, 우선순위는 뒤로**

- 계좌이체는 없애지 않는다(제약). 베트남 소상공인의 지불 관성은 계좌이체·QR 이고(ADR §3-2 지불 관성 데이터 [확인]), 신용카드 보유율은 낮다. **해외카드로 결제할 수 있는 Visa/Master 직불카드 보유율**이 어느 정도인지는 [추정 — 은행계좌 보유 ~87% 이고 대부분 NAPAS 직불카드지만, 국제 브랜드(Visa/Master) 직불카드 비율은 미확인]. 카드 결제 전환율은 **실측 후** 판단한다.
- 따라서 Stage 2 의 SePay 어댑터(S2-2)는 **무효가 아니라 후순위**다. 진입 조건을 "월 계좌이체 계약 30건 또는 수동 등록 주 4h"로 두던 기존 기준을 유지하되, **토스 도입이 끝난 뒤** 카드 비율이 낮다고 판명될 때만 착수한다. 카드 비율이 높으면 SePay 는 영구 보류.
- 계좌이체의 전제인 ADR Q-1(**어느 계좌로 받나 — 한국 계좌 국제송금 vs 현지 계좌**)은 토스로도 풀리지 않는다. 카드가 열리면 Q-1 의 시급성은 내려가지만 사라지진 않는다.

---

## 4. B. 통화 — 표시 VND · 청구 KRW · 확정 가격표

### 4-1. 사실 정리

- 확정 가격은 VND(일반 199,000/539,000/999,000 · 프리미엄 499,000/1,349,000/2,499,000, `ad_tiers.monthly_price_vnd/price_3m_vnd/price_6m_vnd`) [확인].
- 토스 카드결제창은 **기본 KRW**(T-2). **USD/JPY 도 가능하나 별도 다통화 계약 + 별도 MID 필요**(T-3, 2026-09-07 확인 — 상충 해소). VND 는 어느 경로에도 없다 [확인 — ADR 사전조사와 일치]. → **다통화 계약 전까지는 KRW 로 진행**(이번 구현 범위 무변경). USD 전환은 §9 T3 티켓(별도 계약 후)으로 유지.
- 다국어 결제창은 KRW 청구액과 함께 **USD 환산 예상액**을 표시한다(T-4) [확인]. VND 환산 표시는 없다.
- 광고주(베트남 카드 소지자)는 KRW 로 청구되고, **카드사/발급은행이 VND 로 환산**해 청구한다 — 환율과 해외거래 수수료(통상 1~3% [추정])는 카드 소지자 부담.

### 4-2. 세 안 비교

| | (a) 실시간 환율 API 로 VND→KRW 산출 | (b) **KRW 확정 가격표**(대표가 정하는 tier×기간 KRW 6값) ← **채택** | (c) 표시도 USD 로 전환 |
|---|---|---|---|
| 코드 | 외부 API 클라이언트·캐시·장애 폴백·라운딩·정수화·환율 스냅샷 컬럼 | **컬럼 3개 + 스냅샷 필드 1개**. 계산 없음 | (b) 에 표시 통화 로케일 처리 추가 |
| 정수 연산 | 환율(소수) 곱셈 → `Decimal` 또는 milli 정수 필요 | **곱셈 자체가 없다** | 〃 |
| 분쟁 | "그날 환율이 얼마였다"를 증명해야 함 | 계약 페이지에 두 금액을 **함께 보여주고 스냅샷에 둘 다 저장** — 광고주가 동의한 것이 곧 증거 | 〃 |
| 환율 변동 | 자동 반영(표시 VND 는 고정인데 청구 KRW 가 매일 흔들림 → 광고주가 "왜 지난주랑 달라" 묻는다) | 운영자가 분기·큰 변동 시 6값 UPDATE. 이미 accepted 된 계약은 스냅샷 값 유지 | 〃 |
| 광고주 인식 | 결제창 KRW + USD 예상액, 우리 페이지 VND — 통화 3개 | **우리 페이지에 VND(계약가) + "₩N 이 청구되며 카드사가 VND 로 환산" 명시** | USD 는 베트남 소상공인에게 낯설다(현지 상거래는 VND 표기가 법정 [확인 — 베트남 외환관리령상 국내 가격 표시는 VND 원칙, 상세 조항은 §7 Q-6 확인 필요]) |
| 판정 | 과설계. 요청되지 않은 유연성 | **최소** — Karpathy #2 | 표시 통화를 바꿀 근거 부족 |

**(b) 채택 근거**: 가격은 원래 대표가 정하는 사업 변수다. VND 가격표를 정할 때 이미 원가·시장가를 봤듯 KRW 가격표도 같은 방식으로 정하면 된다(예: 199,000 VND ≈ 10,700~10,900 KRW 수준 [추정 — 2026-09 환율 ~18.3~18.6 VND/KRW, 실제 값은 대표가 정함 **D-F**]). 환율을 코드가 계산하는 순간 "환율이 틀렸다"가 우리 책임이 되고, 가격표로 정하면 "가격이 이렇다"가 된다.

**표시 통화는 VND 유지**(3 번 질문의 답). 광고주 인식·베트남 상거래 관행·이미 확정된 결정 모두 VND 를 가리킨다. USD 표기가 "현실적"인 경우는 우리가 USD MID 로 실제 USD 청구를 할 때뿐이고, 그건 별도 계약(T-3)이 확정된 뒤의 선택지다(§6 T3 단계).

### 4-3. 데이터 — 청구금액 스냅샷

- **`ad_tiers.price_1m_krw / price_3m_krw / price_6m_krw BIGINT NULL`** 추가(`database/init/229_ad_tiers_krw_prices.sql`, 멱등). 시드 값은 **대표 결정 D-F** 후 UPDATE — 마이그레이션은 컬럼만 만들고 값은 NULL 로 둔다(NULL = seam-D 미배선 → 카드 버튼 숨김. 0 이나 임시값을 넣으면 무료·오가 계약이 생긴다 — `ad_contract.py::_tier_price_for_months` 가 3M/6M NULL 을 None 으로 돌려주는 것과 같은 원칙).
- **`accept()` 시 `contract_snapshot` 에 `charge` 필드 추가**: `{"charge": {"currency": "KRW", "value": 10900, "price_col": "price_1m_krw"}}`. 동의 시점에 두 금액이 함께 고정된다. 이후 `price_*_krw` 를 바꿔도 이 계약의 청구액은 안 변한다(입금 기한 7일 동안 흔들리지 않음). KRW 가격이 NULL 이면 `charge` 없이 accept 되고(계좌이체만 가능한 계약), 나중에 KRW 가격이 생겨도 이 계약엔 카드 버튼이 뜨지 않는다 — 광고주가 페이지를 다시 열어 "카드로 바꾸고 싶다"면 관리자가 취소 후 재계약(드물다, 새 개념 안 만든다).
- **`ad_deposits.charge_snapshot JSONB NULL`** 추가(같은 229 마이그레이션) — §3-4.
- 라운딩·환율 변동 처리 로직: **없음**(가격표이므로). 대표가 6값을 정할 때 100원 단위로 끊는 것을 권고(결제창 표시 단정함).

### 4-4. 환불과 환율

- 토스 취소는 KRW 동일 금액을 카드로 되돌린다. 카드 소지자가 받는 VND 는 환불 시점 카드사 환율이라 **결제 때 낸 VND 와 다를 수 있다**(T-12 "환율 변동이 환불액에 영향") — 우리가 통제할 수 없다. **계약 문안(ADR E-5)에 "환불은 청구 통화(KRW) 기준이며 카드사 환율 차액·수수료는 보전하지 않는다" 조항** 필요 — 법무 [확인 필요 Q-4 에 추가].
- 원장 처리는 §5-6.

---

## 5. C. 미배선 상태의 동작 · D. 보안·정합성

### 5-1. 배선 상태 3단과 각 단의 동작

```python
# services/ad_payments/config.py 에 추가 (읽기만)
def toss_mode() -> Literal["off", "stub", "live"]:
    if os.getenv("AD_PAYMENT_TOSS_CLIENT_KEY","").strip() and os.getenv("AD_PAYMENT_TOSS_SECRET_KEY","").strip():
        return "live"            # 테스트 키(test_*)든 운영 키(live_*)든 '진짜 HTTP' — 구분은 토스가 키 접두로 한다
    if os.getenv("AD_PAYMENT_TOSS_STUB","").strip() == "1" and os.getenv("APP_ENV","").strip().lower() in _DEV_ENV_VALUES:
        return "stub"            # dev 전용. APP_ENV 화이트리스트는 main.py:_DOCS_ENABLED 와 같은 fail-safe 판정 재사용
    return "off"
```

| 모드 | 계약 웹페이지 | 관리자 화면 | e2e |
|---|---|---|---|
| `off`(지금) | `rails` 에 `toss_card{wired:false}` → **카드 버튼 숨김**. 계좌 카드는 seam-A 상태대로. 둘 다 미배선이면 "결제 안내 준비 중, 담당자가 연락"(기존 문구) | `payment-wiring` 응답에 `toss: {ready:false, missing_keys:[…]}` 추가 → 배너 "카드결제 미배선" | 계좌 경로 e2e(기존 `test_ad_payment_pipeline_e2e.py`) 그대로 |
| `stub`(dev) | 카드 버튼 **활성**. SDK 대신 SPA 가 `checkout.stub === true` 를 보고 **successUrl 로 즉시 이동**(`paymentKey=stub_<uuid>`, `orderId`, `amount` 쿼리 포함) — 결제창 없이 리다이렉트 계약만 재현 | 입금건에 `source=toss` 배지, `charge_snapshot.psp="toss-stub"` | **seam-C e2e**: offer → 리다이렉트 → confirm(스텁 게이트웨이가 DONE Payment 반환) → ingest → 자동 approve → `paid_until` → `public_ads()` 노출. 웹훅 라우터에 스텁 페이로드 POST → lookup → `duplicate=True`(기간 두 번 안 늘어남) |
| `live` | 진짜 SDK·결제창. 키가 `test_` 면 가상 승인(T-11) | 동일 | 테스트 키로 §5-2 |

**미배선 e2e 가 성립하는 이유**: 어댑터의 모든 판단(orderId 파싱·금액 대조·멱등키·매핑·자동 승인 조건)은 `TossGateway` 위에 있고, 스텁 게이트웨이는 그 아래 HTTP 3호출만 흉내낸다. 즉 **스텁이 대체하는 것은 "토스 서버"뿐**이고 우리 코드는 한 줄도 우회하지 않는다. `.env` 가 비어 있어도 `pytest` 가 스텁을 직접 주입해(`AD_PAYMENT_TOSS_STUB` 없이 생성자 인자로) 전 경로를 돈다.

### 5-2. 테스트 키로 어디까지 되나

| 검증 항목 | 스텁 | 테스트 키 | 운영 키 |
|---|---|---|---|
| 우리 코드 전 경로(파싱·대조·멱등·자동승인·원장·노출) | ✅ | ✅ | ✅ |
| 토스 요청/응답 스키마 실제 일치(필드명·타입·에러 코드) | ❌ | ✅ | ✅ |
| 다국어 결제창·해외카드 테스트 카드 흐름(T-13) | ❌ | ✅ | ✅ |
| 웹훅 실수신(재전송·헤더) | ❌(라우터 단위만) | **[확인 필요 T-14]** — 되면 ngrok/dev 도메인으로 등록 | ✅ |
| 실제 해외카드 승인·정산·차지백 | ❌ | ❌ | ✅ |
| 가입 승인 전 사용 가능 | ✅ | **부분**(T-11 "체험 상점 일부 테스트 키" — 본 상점 테스트 키는 승인 후 [추정]) | ❌ |

**판정**: 테스트 키는 "미배선 e2e" 를 **대체하지 못하고 보완한다**. 지금(승인 전)은 문서 공개 테스트 키로 스키마 일치만 1회 확인하고, CI·개발 루프는 스텁으로 돈다. 본 상점 테스트 키가 나오면 §6 T1 단계.

### 5-3. `.env` 키 — 2개 (+ 기존 키 배선 누락 1개)

| 키 | `.env.example` 플레이스홀더 | 노출 범위 | 미설정 시 |
|---|---|---|---|
| `AD_PAYMENT_TOSS_CLIENT_KEY` | `` (빈 값) | **공개 가능**(브라우저 SDK 초기화용, T-11). 단 **랜딩 빌드(`VITE_*`)에 박지 않고** BFF 가 `GET /public/ad-contract/{token}` 응답 `rails[].checkout.client_key` 로 내려준다 — 배선을 서버 한 곳에 모으기 위해(랜딩 재빌드·재배포 없이 키 교체) | 카드 버튼 숨김(`off`) |
| `AD_PAYMENT_TOSS_SECRET_KEY` | `` (빈 값) | **서버 전용**. 로그·응답·에러 메시지에 절대 노출 금지. `payment-wiring` 은 키 **이름**만 | 카드 버튼 숨김(`off`) |
| `AD_PAYMENT_TOSS_STUB` | `` (빈 값) | dev 전용 스위치. `APP_ENV` 가 dev 화이트리스트가 아니면 무시 | `off` |
| `BIZ_PORTAL_BASE_URL` (기존) | 이미 있음 | successUrl/failUrl 의 베이스 | 코드 기본값 `https://business.saigon-rider.com` — **compose 배선 누락 상태**(§1) |

- 플레이스홀더를 `change_me_*` 가 아니라 **빈 값**으로 둔다: 이 파이프라인은 "**빈 값 = 미배선**" 이 계약이다(seam-A 와 동일). `change_me_toss_secret` 을 넣으면 `toss_wiring_ready()` 가 True 가 되어 잘못된 키로 진짜 HTTP 를 친다. agent-guidelines §4 규칙 5 의 취지(비밀 항목엔 placeholder)와 어긋나는 점은 주석으로 명시 — **[규약 확인 — 감독]**.
- **웹훅 시크릿 키는 두지 않는다**: 토스 결제 웹훅에 서명이 없고(T-10), 우리는 페이로드를 신뢰하지 않고 `paymentKey` 로 **시크릿 키 재조회**(lookup)만 하므로 웹훅 자체의 인증은 불필요하다. 웹훅 URL 에 추측 불가 경로 토큰을 넣는 것도 하지 않는다(재조회가 검증이므로 과설계).
- **compose `bff.environment` 에 4줄 추가**(`.env` 만으로는 컨테이너에 전달되지 않는 함정 — 파이프라인 문서 F-3):
  ```yaml
        - AD_PAYMENT_TOSS_CLIENT_KEY=${AD_PAYMENT_TOSS_CLIENT_KEY:-}
        - AD_PAYMENT_TOSS_SECRET_KEY=${AD_PAYMENT_TOSS_SECRET_KEY:-}
        - AD_PAYMENT_TOSS_STUB=${AD_PAYMENT_TOSS_STUB:-}
        - BIZ_PORTAL_BASE_URL=${BIZ_PORTAL_BASE_URL:-https://business.saigon-rider.com}
  ```
- `.env`·`.env.example` 키셋 동시 갱신(§4 규칙 2). 실제 키 값은 `.env` 에만.

### 5-4. 운영 키를 받았을 때 바뀌는 파일 — **0개** (증명)

구현(§8 P2-*)을 지금 끝내 두면, 키 수령 시 변경은:

| 변경 | 어디 | 코드인가 |
|---|---|---|
| `AD_PAYMENT_TOSS_CLIENT_KEY`·`AD_PAYMENT_TOSS_SECRET_KEY` 값 채움 | `.env`(서버) | 아니오 |
| 웹훅 URL `https://app.saigon-rider.com/api/public/ad-contract/webhooks/toss` 등록, `PAYMENT_STATUS_CHANGED` 선택 | 토스 개발자센터(MID 별) | 아니오 |
| (해외카드 옵션·성공/실패 리다이렉트 도메인 등 MID 설정) | 토스 개발자센터 | 아니오 |
| `bff` 재기동(`docker compose --env-file .env up -d bff`) | 운영 | 아니오 |
| `ad_tiers.price_*_krw` 6값 UPDATE(D-F) | DB(관리자 tier 화면 또는 SQL) | 아니오 — 키와 무관하게 D-F 시점에 |

파일 단위 증명 — 두 키를 읽는 코드는 **`services/ad_payments/config.py` 한 파일**(`toss_mode()`, `get_toss_keys()`)이고, 어댑터·라우터·SPA 는 `config` 를 통해서만 안다. `grep -rn AD_PAYMENT_TOSS backend/ landing/ admin-frontend/` 결과가 `config.py`·`.env.example`·`docker-compose.yml` 세 파일이어야 하며, 이것을 **테스트로 고정**한다(P2-7: 소스 트리 grep 어서션). 이 이상이 바뀌어야 한다면 경계가 틀린 것이다.

파이프라인 문서 §2-4 가 "어댑터 1개 + `.env` N키 + compose N줄" 을 **은행 API 도입 시점**의 변경량으로 정의한 것과 달리, 토스는 어댑터를 **지금**(키 없이) 만들 수 있으므로 키 시점 변경량은 그보다 작다.

### 5-5. 보안·정합성 상세

**D-1 키 노출 범위** — §5-3. 계약 SPA(다른 오리진)는 클라이언트 키만, BFF 응답으로 받는다. 시크릿 키는 BFF 프로세스 밖으로 나가지 않는다(응답·로그·audit detail 금지 — audit 에는 `payment_key`·`order_id` 만).

**D-2 웹훅 검증·멱등**
- 라우터 `POST /public/ad-contract/webhooks/toss`(무인증, `ad_contract.py` 가 아니라 **어댑터 파일 안의 `APIRouter`** 를 `adapters/__init__.py` 패턴처럼 `rails/__init__.py` 가 노출 → `main.py` include 1줄).
- 처리: `parse_webhook` → `paymentKey` → `lookup` (시크릿 키로 `GET /v1/payments/{paymentKey}`) → `DONE` 이면 orderId 에서 계약 특정 → `complete_checkout()`. **항상 200 을 빨리 돌려준다**(T-10 10초) — 처리 실패는 우리 로그·재조회로 잡고, 200 을 못 주면 토스가 7회 재전송한다(그 재전송도 같은 `paymentKey` 라 안전).
- 멱등: `UNIQUE(source='toss', source_ref=paymentKey)`. confirm 과 웹훅이 동시에 오면 한쪽은 `ingest_deposit` 의 사전 조회 또는 IntegrityError 재조회로 `duplicate=True` → `complete_checkout()` 은 duplicate 면 승인 시도 없이 종료. 승인 두 번은 `approve()` 가 `status ∉ {paid, partially_paid}` 를 거부해 2중 방어. **기간은 계약 승인 1회에서만 늘어난다**(파이프라인 §4-4 규칙 그대로).
- 웹훅 `CANCEL_STATUS_CHANGED`/`PARTIAL_CANCELED` 는 Stage 이후 — 환불은 우리가 개시하므로(§5-6) 우리 쪽 기록이 먼저 남는다. 토스 콘솔에서 사람이 직접 취소한 경우의 역방향 동기화는 **[대표 결정 D-G]**(원칙: 콘솔 취소 금지, 어드민에서만).

**D-3 confirm 실패·타임아웃 복구**
| 상황 | 상태 | 복구 |
|---|---|---|
| 결제창 인증 성공 → SPA 가 successUrl 에 도착했으나 confirm 호출 전에 브라우저 종료 | 돈 **안 빠짐**(승인 전). 10분 뒤 세션 만료(T-6) | 없음 필요. 광고주가 다시 결제. 새 orderId(attempt) |
| confirm 요청 보냈는데 응답 타임아웃 | 토스는 승인했을 수도, 안 했을 수도 | `lookup(paymentKey)` → `DONE` 이면 정상 완료 처리 / 아니면 SPA 에 "확인 중" 응답. 웹훅 `PAYMENT_STATUS_CHANGED` 가 오면 완료. **어드민 "재동기화" 버튼**(`POST /admin/api/biz/contracts/{id}/rail-sync {ref}`) 이 같은 `lookup` 을 사람이 누르는 경로 |
| confirm 응답 `ALREADY_PROCESSED_PAYMENT` | 이미 승인됨(웹훅 선착 또는 재클릭) | `lookup` 으로 대체 → `duplicate` 경로 |
| confirm 응답 `NOT_FOUND_PAYMENT_SESSION` | 10분 초과 | 광고주에게 "시간 초과, 다시 결제" |
| 승인은 됐는데 우리 DB commit 실패 | 돈 빠짐, 원장 없음 | 웹훅(최대 3.8일 재전송) + 어드민 재동기화 + **일 1회 대사 잡은 만들지 않는다**(Karpathy — 웹훅+수동 재동기화로 충분한 볼륨. 월 100건 넘으면 재검토) |

`Idempotency-Key: paymentKey` 를 confirm 에 붙이므로 우리가 재시도해도 토스 쪽 이중 승인은 없다(T-7).

**D-4 오리진·리다이렉트·CORS**
- `successUrl = {BIZ_PORTAL_BASE_URL}/apply/pay/return?token={contract_token}`, `failUrl = {BIZ_PORTAL_BASE_URL}/apply/pay/fail?token={contract_token}` — 토스가 뒤에 쿼리를 덧붙인다(T-5). SPA 라우트 2개 신설(정적 SPA 라 nginx 폴백으로 해결, `deploy/saigon-rider.conf` 가 이미 SPA fallback 이면 무변경 **[확인 필요 — conf 실측]**).
- SPA `/apply/pay/return` 은 쿼리의 `paymentKey/orderId/amount` 를 **그대로** `POST https://app.saigon-rider.com/api/public/ad-contract/{token}/checkout/confirm` 에 보낸다. BFF 가 금액을 스냅샷과 대조하므로 SPA 는 금액을 신뢰하지도 계산하지도 않는다.
- CORS: `CORS_ALLOWED_ORIGINS` 에 `https://business.saigon-rider.com` 이 이미 있음 [확인 `.env.example:28`]. 신설 엔드포인트는 기존 `/public/ad-contract/*` 와 같은 라우터·prefix 라 추가 설정 없음. 웹훅은 서버→서버라 CORS 무관.
- 토큰 `contract_token` 이 URL 에 노출되는 것은 기존 계약 페이지와 동일 수준(무인증 조회용 UUID). 리다이렉트 URL 에 실리는 정보는 토큰과 토스 파라미터뿐.

**D-5 Apple 3.1.3(g)/3.1.1** — 기존 결정 유지·강화. 결제는 **계약 웹페이지(외부 브라우저)** 에서만. 앱에는 가격·KRW·카드 문구·client key 어느 것도 내려주지 않는다(P1-7 `contract_status` 파생 1필드만, 기존 결정). **토스 결제창을 WebView 안에서 열면 안 되는 이유**: ① 정책 — 앱 안에서 결제가 완결되면 3.1.3(g) 후단("같은 앱에 표시될 광고 구매는 IAP 필수")에 정면 해당, 외부 브라우저로 빼는 것이 IAP 의무 회피의 전제(ADR §2) ② 기술 — 결제창은 리다이렉트·3DS 인증 페이지·(국내카드) 앱카드 스킴 호출을 쓰는데 WKWebView 는 팝업·커스텀 스킴·쿠키 파티셔닝에서 깨지고, `successUrl` 복귀가 WebView 안에서 일어나면 SPA 라우팅과 세션이 앱 컨텍스트에 갇힌다 ③ 심사 — 심사관이 WebView 안 결제를 "앱 안 결제"로 판단할 근거를 우리가 만들어 주는 셈. `native.openExternalUrl` 경로만 허용(ESLint 의 `navigator.*` 금지 규약과 같은 층위의 강제는 P1-7 계약 테스트 "가격·계좌·코드·toss 문자열이 앱 번들에 없음" grep 어서션에 `tosspayments`·`clientKey` 추가).

**D-6 환불** — §5-6.

**D-7 세무 재검토** — §7.

### 5-6. 환불 — 토스 취소 ↔ `ad_deposits.kind='refund'` ↔ `close_refunded()`

- 개시는 **어드민에서만**: `POST /admin/api/biz/contracts/{id}/rail-refund {deposit_id, amount_vnd?, reason}` → 해당 toss 입금건의 `source_ref`(paymentKey) 로 `rail.refund()` → 토스 `cancel`(`cancelAmount` = 부분이면 `charge_snapshot.value × amount_vnd / contract.amount_vnd` **정수 나눗셈, 원 단위 절사** — 이 한 곳만 비례 계산이 있고 결과는 KRW 정수) → `CheckoutResult(observation.kind="refund", source_ref=f"{paymentKey}:cancel:{transactionKey}")` → `ingest_deposit` (refund 행, `charge_snapshot` 에 취소 응답) → audit `BIZ_AD_DEPOSIT_RECORD`(rail refund).
- **전액 환불**: refund 합계 = deposit 합계 → 관리자가 기존 `close-refunded` 실행(active→refunded, 최신 계약이면 `paid_until` 되돌림 — 기존 코드 그대로).
- **부분 환불**: 토스는 가능(T-9). 우리 원장은 refund 행이 기록되지만 `ingest_deposit` 은 `active` 계약의 상태를 건드리지 않고(`_RECONCILABLE_STATUSES` 밖), `close_refunded` 는 순수액 0 을 요구해 실행 불가 → **"부분 환불 = 기록만, 계약·기간 유지"**(makegood 성격). 기간을 비례 축소하는 로직은 만들지 않는다 — **[대표 결정 D-H]** 부분 환불 허용 여부(기본: 허용하되 기간 무변경, 사유 audit).
- 환불 송금 자체는 사람이 하지 않는다(카드는 토스가) — 계좌이체 환불(사람이 은행에서 송금 후 manual refund 등록)과 **같은 원장, 다른 어댑터**.

---

## 6. E. 로드맵 — 지금 → 테스트 키 → 운영 키

| 단계 | 진입 조건 | 이 단계에서 짜는 코드 | 검증 |
|---|---|---|---|
| **T0 지금(키 없음)** | — | §8 P2-1~P2-8 **전부**(스키마·포트·어댑터 2종·스텁 게이트웨이·코어 `complete_checkout`·공개 API 3개·웹훅·어드민 재동기화/환불·계약 웹페이지 rails UI·테스트) | 스텁 e2e 통과(§5-1) + 문서 공개 테스트 키로 `HttpTossGateway` 스키마 1회 수동 확인 |
| **T1 본 상점 테스트 키** | 토스 가입 승인, 개발자센터에서 `test_ck/sk` 발급 | **코드 0줄**. dev `.env` 2키 + compose(이미 배선) + 웹훅 URL(ngrok 또는 dev 도메인, T-14 확인) | 테스트 카드(Visa/Master)로 다국어 결제창 → confirm → 자동 승인 → 노출 / 웹훅 재전송 수신 → `duplicate` / 취소 → refund 행 / 10분 초과·사용자 취소 failUrl |
| **T2 운영 키** | 심사 통과·`live_ck/sk` 수령·해외카드 옵션 활성(T-15)·D-F KRW 가격 6값 확정·법무 문안(E-5 + 환불 통화 조항) | **코드 0줄**(§5-4). 운영 `.env` 2키, 웹훅 URL 운영 도메인, `ad_tiers` KRW UPDATE | 소액 실카드 1건(결제→노출→전액 환불) 후 오픈 |
| T3 (선택) USD 다통화 | 카드 결제 전환율 실측 후 대표 판단 + 토스 외화 계약(T-3 상충 해소) | 어댑터 `toss_card` 에 `currency` 설정 1개 + `price_*_usd` 컬럼 — 별도 설계 | — |

---

## 7. 대표 결정 · 법무 · 세무 확인 항목

### 7-1. 대표 결정

| # | 결정 | 기본안 |
|---|---|---|
| D-F | **tier×기간 KRW 확정가 6값** (`price_{1,3,6}m_krw` × 일반/프리미엄) | VND 확정가를 2026-09 환율로 환산 후 100원 단위 절상 [추정 범위 §4-2] — 값은 대표가 |
| D-G | 토스 콘솔에서 직접 취소하는 운영을 허용할지(허용하면 역방향 웹훅 동기화 필요) | **불허** — 환불은 어드민에서만 |
| D-H | 카드 부분 환불 허용 여부 및 기간 처리 | 허용, 기간 무변경, 사유 audit |
| D-I | 카드 결제 자동 승인(§3-6) 확정 | 자동 승인 |
| D-J | 계좌이체 병존 유지 + SePay 후순위(§3-7) 확정 | 병존, SePay 는 카드 비율 실측 후 |

### 7-2. 법무 [확인 필요]

| # | 항목 |
|---|---|
| L-1 | 계약 문안(ADR E-5, Q-4)에 추가: **청구 통화 KRW·카드사 환율/해외거래수수료 광고주 부담·환불은 KRW 기준·차지백 시 계약 해지** 조항 |
| L-2 | 토스 가맹 약관상 **해외 거주 고객 대상 판매**(서비스 소비지 베트남)가 허용 업종·형태인지 — ADR 사전조사 "가능성 높음"의 문서 근거 확보 |
| L-3 | 해외 차지백 180일(T-12) 대비 증거 보존: 동의 스냅샷·IP·UA·결제 charge_snapshot 이 충분한지 |

### 7-3. 세무 [확인 필요] — ADR Q-2·Q-3 재검토

| # | 기존 결론 | 토스로 달라질 수 있는 점 |
|---|---|---|
| Q-2 베트남 FCT·VAT | 외국 법인이 VN 사업자에 서비스 공급 → VN 상대방 원천징수 | **결제 수단이 바뀌어도 FCT 의무의 성립 여부는 변하지 않는다**[추정]. 다만 카드 결제는 광고주가 원천징수 후 송금하는 구조가 물리적으로 불가능 → 광고주가 자진 신고·납부해야 하는데 소상공인은 하지 않을 것. 세무: **가격을 "세후 수취액" 으로 규정하고 gross-up 을 광고주 부담으로 문안화하는 것이 맞는지**, 또 **한국 법인이 VN GDT 외국공급자 포털 등록으로 대신 신고·납부하는 경로**가 B2B 에도 열려 있는지 |
| Q-3 한국 외국환거래법 | 소액 해외 서비스 수입 신고 임계 | **토스 정산은 국내 PG 의 KRW 정산**이므로 "외국환 수령" 형태가 아니다 → 외국환거래 신고 대상에서 벗어나는지 [확인 필요]. 반대로 **한국 부가가치세**: 비거주자에 공급하는 용역은 영세율(부가가치세법 §24, 외화획득 용역)이 가능하지만 **외화로 받아야** 하는 요건이 있어 KRW 로 정산되는 카드 매출에 영세율이 적용되는지 [확인 필요 — 세무] — 적용 안 되면 10% VAT 를 가격에 포함해야 하고 KRW 가격표(D-F)에 반영해야 한다 |
| Q-5 (신규) | — | 토스 매출은 한국 법인 국내 매출로 세금계산서/현금영수증 체계에 잡힌다. 베트남 광고주에게 발행할 증빙(인보이스) 형식과 한국 측 매출 인식(영세율 여부)을 함께 정리 |
| Q-6 (신규) | — | 베트남 국내 거래 **가격 표시 통화 규정**(외환관리령 Pháp lệnh Ngoại hối §22 — 국내에서 외화 표시·결제 원칙 금지)이 **외국 사업자의 온라인 서비스 가격 표시**에 미치는지. VND 표시 유지(§4-2)는 이 위험을 낮추지만, KRW 청구액을 함께 표시하는 것이 문제 되는지 확인 |

---

## 8. 구현 티켓

기존 P1 티켓과의 관계: **P1-1~P1-4 완료(무영향, 재사용)** · **P1-5(어드민 화면)·P1-6(계약 웹페이지) 미구현 → 아래 P2-6/P2-7 이 rails 버전으로 대체**(계좌 전용 버전을 먼저 만들지 않는다) · **P1-7(앱 배지) 무영향**(grep 어서션 키워드만 추가) · **P1-8(문서) → P2-9 로 이관**. 파이프라인 문서 S2-2(SePay)·S2-5(D-E 자동승인) 는 §3-7·§3-6 대로 후순위/부분 결정.

의존 순서대로. 각 티켓은 독립 커밋 가능. **모든 티켓은 키 없이 완료·검증 가능**해야 한다(1급 목표).

| # | 제목 | 파일 후보 | 검증(테스트로 확인) | 의존 |
|---|---|---|---|---|
| **P2-1** | 스키마 229 | `database/init/229_ad_toss_rail.sql`(`ad_tiers.price_1m_krw/price_3m_krw/price_6m_krw BIGINT NULL` · `ad_deposits.charge_snapshot JSONB NULL`, 전부 `IF NOT EXISTS`) · `docker-compose.yml` `bff_migrate` command+volumes 228 아래 · `models.py`(`AdTier` 3필드, `AdDeposit.charge_snapshot`) | `bff_migrate` 2회 실행 오류 0 · ORM 컴파일 · KRW 컬럼 NULL 시드 확인(값 없음) | — |
| **P2-2** | 설정·상수·포트 값 확장 | `services/ad_payments/config.py`(`toss_mode()`, `get_toss_keys()`, `TOSS_ENV_KEYS`) · `constants.py`(`AUTO_APPROVE_SOURCES=("toss",)`) · `port.py` `source` Literal 에 `"toss"` · `.env.example`+`.env`(3키 동시) · `docker-compose.yml` `bff.environment` 4줄(§5-3, `BIZ_PORTAL_BASE_URL` 포함) | `tests/test_ad_toss_config.py`: 키 둘 다 있으면 live / 하나만 있으면 off / STUB=1 이고 APP_ENV=development 면 stub / APP_ENV=production 이면 STUB 무시 · `.env`↔`.env.example` 키셋 diff 0 · compose 4줄 존재 grep | — |
| **P2-3** | seam-C 포트·어댑터 2종·게이트웨이 | `services/ad_payments/rails/__init__.py`(registry `RAILS = {"bank_transfer": …, "toss_card": …}`, `router` 노출) · `rails/base.py`(`PaymentRail`, `RailOffer`, `CheckoutResult`, `RailNotSupported`) · `rails/bank_transfer.py`(null-object) · `rails/toss_card.py`(어댑터 + `TossGateway` 프로토콜 + `HttpTossGateway`(httpx, Basic auth, `Idempotency-Key`) + `StubTossGateway` + 웹훅 `APIRouter`) | `tests/test_ad_toss_rail.py`(스텁 게이트웨이 주입): `offer()` 에 시크릿 키 문자열 부재 · orderId 형식 `SGR-…-n` · confirm 금액 불일치 → 예외 · 다른 계약 코드 orderId → 예외 · `ALREADY_PROCESSED_PAYMENT` → lookup 대체 · 매핑 필드(§3-4) 전부 · bank_transfer 의 confirm/lookup/refund → `RailNotSupported` · `parse_webhook` 이 상태·금액을 읽지 않음(페이로드 조작 케이스) | P2-2 |
| **P2-4** | 코어 `complete_checkout` + `accept` 스냅샷 확장 | `services/ad_payments/checkout.py`(신규: `complete_checkout(db, contract, ad, result, *, now)` — ingest → 조건부 approve → audit/알림 payload 반환) · `contracts.py accept()` 에 `snapshot["charge"]` 는 호출부(라우터)가 채움 — 함수 시그니처 무변경 | `tests/test_ad_checkout_core.py`: 정확 일치 → `active`·`paid_until` 세팅·actor `system:toss` · duplicate → 승인 없음 · 이미 active → 승인 없음 · `partially_paid` → 승인 없음 · `AUTO_APPROVE_SOURCES` 에 없는 source → 승인 없음 · 웹훅+confirm 동시(같은 paymentKey 2회) → 행 1·기간 1회 | P2-3 |
| **P2-5** | 공개 API·웹훅 배선 | `routers/ad_contract.py`(GET 응답에 `rails: [RailOffer…]` 추가, `bank` 필드는 하위호환 유지 · `POST /public/ad-contract/{token}/checkout/confirm {paymentKey, orderId, amount}` · accept 시 `charge` 스냅샷) · `main.py` `rails.router` include 1줄(웹훅 `POST /public/ad-contract/webhooks/toss`) | `tests/test_ad_contract.py` 확장: off 모드 → `rails[toss].wired=false`·`checkout=null` / stub 모드 → `checkout.client_key` 존재·`stub=true` / KRW NULL → toss `wired=false` / confirm 성공 → 200 + `status=active` / 웹훅 POST → 200 즉시 + 처리 · 응답 JSON 어디에도 시크릿 키 없음(문자열 검색) | P2-4 |
| **P2-6** | 어드민 API·화면 (P1-5 대체) | `routers/admin_api/biz_contracts.py`(`payment-wiring` 응답에 `toss` 블록 · `POST /contracts/{id}/rail-sync {ref}` · `POST /contracts/{id}/rail-refund {deposit_id, amount_vnd?, reason}`) · `admin-frontend/src/pages/biz/BizContractListPage.tsx`·`BizContractDetailPage.tsx`(신규 — 파이프라인 §5-2 + 입금건 `source` 배지 `manual/toss`·`charge_snapshot` 표시(KRW·카드)·재동기화·카드환불 버튼) · `api/biz.ts` · `App.tsx` 라우트 · 미배선 배너 2종(계좌/카드) | `tests/test_admin_biz_contracts.py` 확장: rail-sync 로 미기록 결제 복구 → 행 생성·승인 / rail-refund 부분 → refund 행·계약 active 유지 / 전액 → close-refunded 가능 / bank_transfer 계약에 rail-refund → 409 · `tsc -b` 0 · ESLint 0 | P2-5 |
| **P2-7** | 계약 웹페이지 (P1-6 대체) | `landing/apps/client/src/pages/apply/Index.tsx`(상태 6종 + `rails[]` 렌더: 계좌 카드 / [카드로 결제] 버튼 → 토스 v2 SDK `requestPayment` · stub 이면 즉시 successUrl 이동) · `pages/apply/PayReturn.tsx`·`PayFail.tsx`(신규 라우트 2개) · `lib/adContractApi.ts`(신 타입·confirm 호출) · `content.ts`(3로케일: 기간 선택·준비 중·계좌 카드·카드 결제·KRW 청구 고지·상태·실패 코드) · SDK 로드는 `<script src="https://js.tosspayments.com/v2/standard">` **[확인 필요 — 현행 v2 스크립트 URL 실측]** | 랜딩 빌드 0 에러 · 로케일 3벌 키 패리티 · `grep -r "AD_PAYMENT_TOSS\|sk_" landing/` 0건(키가 번들에 없음) · 렌더 스냅샷: off(계좌만/둘 다 준비 중)·stub(버튼) | P2-5 |
| **P2-8** | 경계 고정 테스트 + 스텁 e2e | `backend/app/tests/test_ad_toss_boundary.py`(소스 트리 grep: `AD_PAYMENT_TOSS` 참조 파일 = `config.py`·`.env.example`·`docker-compose.yml` 만 / `paid_until` 대입은 `contracts.py` 만 / `rails/` 안에 `approve(` 호출 0건) · `test_ad_payment_pipeline_e2e.py` 확장(카드 시나리오: offer→redirect→confirm→approve→public_ads 노출, 웹훅 재전송 duplicate) · `frontend` 계약 테스트 grep 키워드에 `tosspayments`·`clientKey` 추가(P1-7) | 전부 PASS, ruff 0 | P2-7 |
| **P2-9** | 문서 동기화 (P1-8 이관) | `ai-docs/context/current.md` · `schema/erd.md`(컬럼 4개) · `context/service-rules.md` §광고 노출 5·6 에 "쓰기 주체 `approve()` 호출자에 `system:toss` 자동 승인 추가, 어댑터 직접 호출 금지" 1문장 · 본 문서 §1 실측표 갱신 · `codebase-memory index_repository`(MCP 복구 시) | — | 전부 |

**의도적으로 뺀 것**: USD 다통화·PayPal(T3)·실시간 환율·일일 대사 배치·토스 콘솔 역방향 동기화(D-G)·부분환불 기간 비례축소(D-H)·빌링키/자동갱신(ADR §4 선불 기간제 결정 유지)·SePay(§3-7)·랜딩 빌드에 키 주입·웹훅 서명/경로 토큰(재조회가 검증).

---

## 9. 기존 문서 결정 대응표 (무엇이 바뀌나)

| 기존 문서·항목 | 기존 결정 | 본 문서 | 상태 |
|---|---|---|---|
| ADR §0-2 / §3-4 / §7 Stage 2 | 계좌이체 유지, PG 유보, Stage 2 에 2C2P 크로스보더 검토(월 30건·주 4h 조건) | 토스페이먼츠 채택(ADR 최상단 블록). Stage 2 PG 비교 무효. 로드맵은 §6 T0~T3 로 대체 | **대체** |
| ADR §3-2 표 G행 "국내 PG 해외카드(토스 등) — 차선" | 차선 | **주 레일** | 대체 |
| ADR §3-2 표 A행 계좌이체 | Stage 1 유지 | 유지, 카드와 **병존**(§3-7) | 유지 |
| ADR §3-3 세금·외환(Q-2·Q-3) | FCT 원천징수·외국환 신고 검토 | 카드·KRW 정산으로 쟁점 재구성(§7-3 Q-2·Q-3·Q-5·Q-6) | **재검토 필요** |
| ADR §2 IAP 판정 / §2-3 L0~L4 | 결제는 웹, 앱은 CTA 수위만 | 유지 + WebView 금지 근거 명시(§5-5 D-5) | 유지·강화 |
| ADR §4 과금(선불 1/3/6, `paid_until`) | 확정 | 무변경. 카드도 선불 단건(빌링키 없음) | 유지 |
| ADR §6 웹훅 메모 "웹훅이 관리자 활성화와 동일한 서비스 함수 호출" | 메모 | `complete_checkout()` → `contracts.approve()` 로 실현(§3-6) | 실현 |
| ADR §9 T-5 만료 알림 · T-6 iOS CTA·사본 | 별건 | 무영향 | 유지 |
| 파이프라인 §0 "배선 지점은 두 개뿐" | seam-A·B | seam-C(결제 개시)·D(KRW 가격) 추가 → **넷** | **확장** |
| 파이프라인 §2-1 `DepositObservation.source` Literal 3종 | manual/csv/bank_feed | `toss` 추가(값 1개) | 확장 |
| 파이프라인 §2-2 "통화는 VND 고정이라 키로 빼지 않는다" | VND 고정 | 표시 VND 유지, **청구 KRW 는 `ad_tiers` 컬럼(seam-D)** — `.env` 키가 아니라 가격표 | **수정** |
| 파이프라인 §2-4 은행 API 도입 시 변경량 | 어댑터 1 + registry 1줄 + `.env` 2키 | 토스는 어댑터를 **지금** 만들고 키 시점 변경 코드 0(§5-4) | 보완 |
| 파이프라인 §3-2 `ad_deposits` "넣지 않은 것: `currency`(VND 고정)" | 컬럼 없음 | `amount_vnd` 는 VND 액면 유지, 실청구는 `charge_snapshot JSONB`(§3-4) | 수정 |
| 파이프라인 §4-2 대조 8케이스 / §4-3 기간 / §4-4 멱등 | 확정 | 무변경. 카드는 항상 "정확 일치" 케이스 | 유지 |
| 파이프라인 §4-2 환불 "송금은 사람이" | manual refund | 카드는 `rail.refund()`(토스 취소) → 같은 refund 행(§5-6) | 확장 |
| 파이프라인 §6 D-E "정확 일치 자동 승인" | Stage 1 사람 승인, 결정 시 플래그 1개 | **toss 는 자동 승인**(`AUTO_APPROVE_SOURCES`), bank_feed 는 여전히 미결 | 부분 결정 |
| 파이프라인 §8 P1-5 · P1-6 | 계좌 전용 어드민 화면·계약 페이지 | **미구현 상태 → P2-6·P2-7 rails 버전으로 대체** | 대체 |
| 파이프라인 §8 P1-1~P1-4 | 완료 | 재사용, 무영향 | 유지 |
| 파이프라인 §8 P1-7 / P1-8 | 앱 배지 / 문서 | grep 키워드 추가 / P2-9 이관 | 유지/이관 |
| 파이프라인 §8 S2-2 SePay · S2-5 자동승인 | Stage 2 | 후순위(§3-7) · toss 부분 결정 | 후순위 |
| `service-rules.md` §광고 노출 6 불변식·쓰기 주체 | `approve()` 단일 | 유지. 호출자에 `system:toss` 추가(P2-9 1문장) | 유지·보완 |

---

## 부록 A. 출처

- 토스페이먼츠 결제창 v2 연동 — https://docs.tosspayments.com/guides/v2/payment-window/integration
- 다국어 결제창(`useInternationalCardOnly`) — https://docs.tosspayments.com/guides/v2/payment-window/integration-international
- 해외결제 연동(KRW 기본·다통화 별도계약·MID=통화 1개) — https://docs.tosspayments.com/guides/v2/learn/foreign-payment
- 해외결제 총정리(지원 카드·3DS·차지백 180일·정산) — https://docs.tosspayments.com/resources/glossary/international-payment
- SDK 파라미터(영문, `amount.currency` KRW/USD 제약·`orderId` 규칙) — https://docs.tosspayments.com/en/integration
- 코어 API 레퍼런스(Payment 객체·confirm·cancel·조회) — https://docs.tosspayments.com/reference
- 에러 코드 — https://docs.tosspayments.com/reference/error-codes
- 멱등키 — https://docs.tosspayments.com/reference/using-api/idempotency-key
- 웹훅 이벤트(서명 범위·헤더) — https://docs.tosspayments.com/reference/using-api/webhook-events
- 웹훅 연결(등록·재전송 7회·10초) — https://docs.tosspayments.com/guides/v2/webhook
- API 키(테스트/라이브·노출 범위·가입 전 체험 키) — https://docs.tosspayments.com/reference/using-api/api-keys
- 결제위젯 연동(성공 리다이렉트 파라미터·금액 검증) — https://docs.tosspayments.com/guides/v2/payment-widget/integration
- 개발자센터 — https://developers.tosspayments.com/
