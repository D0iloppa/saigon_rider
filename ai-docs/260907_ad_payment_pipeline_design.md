# 설계 — 광고 계약·입금·대조·승인 파이프라인 (배선 경계 포함) (2026-09-07)

> **설계 문서.** 이번 세션 코드 변경: **없음** (문서만). 구현은 §8 티켓으로.
> **상위 결정 문서**: [`260907_biz_ad_payment_contract_adr.md`](260907_biz_ad_payment_contract_adr.md) — 결제 레일(계좌이체+수동승인)·과금(선불 1/3/6개월)·IAP 회피·`checkbox_v1` 은 그 문서에서 확정됐고 **여기서 재논의하지 않는다**. 그 문서의 §9 티켓 T-3(관리자 활성화에 입금 기록)·T-4(계약 스냅샷)·T-6(계좌 문구)은 본 문서가 **대체·구체화**한다(§8 대응표).
> 표기 규약: **[확인]** = 코드·공식 문서로 확인 / **[추정]** = 근거는 있으나 확정 아님 / **[확인 필요]** = 실측·법무·대표 확인 필요.

---

## 0. 파이프라인 한 장 요약

**목표(대표 지시)**: *"구현을 했지만 실제 계좌로 배선하지 않은 상태"* 와 *"구현 자체를 안 한 상태"* 를 구분한다. 파이프라인 본체(계약→입금→대조→승인→노출)는 **지금 전부 시스템화**하고, 전자적으로 확정할 수 없는 것(실제 계좌·예금주·은행 API 자격증명)만 **배선 지점(seam)** 으로 분리한다. 미배선 상태에서도 파이프라인은 끝까지 돈다. 나중에 은행 API 는 **어댑터 하나 갈아끼우기**로 붙는다.

```
 [앱] 광고주                [웹] business.saigon-rider.com              [어드민] admin-frontend           [공개면] 앱 피드·마켓
 ─────────────              ───────────────────────────────              ────────────────────────           ───────────────────
 "계약하기" 버튼 ──토큰──▶ ① 계약 (ad_contracts 1행 생성, 기간 1/3/6 선택, 동의)
   (가격 비노출)               │ 상태 draft → accepted
                               │ 입금 식별코드 발급 (예: SGR-7K3M9Q2)
                               ▼
                            ② 입금 안내 ──── ⚡seam-A: 계좌·예금주·은행명 = .env ───▶ 미배선이면 "준비 중" 표시, 계약 상태는 accepted 유지
                               │ 상태 accepted → awaiting_payment (안내가 실제 표시된 시점)
                               │
                               │  광고주가 은행앱에서 이체, 적요란에 식별코드
                               ▼
                            ③ 입금 관측 ──── ⚡seam-B: DepositSource 포트 ───┐
                                               ├ ①manual  (관리자 수동 입력)   ← Stage 1 구현
                                               ├ ②csv     (명세서 업로드)      ← 향후, 포트만 수용
                                               └ ③bank_feed(웹훅/폴링)         ← 향후, 포트만 수용 (.env 자격증명)
                                                       │  모두 같은 DepositObservation 을 만들어
                                                       ▼
                            ④ ingest_deposit() — 코드로 계약건 특정, 멱등 삽입(ad_deposits), 대조(reconcile)
                               │ 상태 awaiting_payment → partially_paid | paid   (미매칭은 contract_id NULL 로 보관)
                               ▼
                            ⑤ 승인 (사람) ─── 관리자가 대조 결과 화면에서 근거 확인 후 approve
                               │ 상태 paid → active, period_start/end 확정, ad.paid_until 갱신, audit + 알림
                               ▼
                            ⑥ 노출 ─── ad_gating.launching_ad_conditions (무변경) 가 ad.subscription_status/paid_until 로 판정
                               │ 만료는 배치 없이 조회 시점 파생 (paid_until < now → expired)
```

**배선 지점은 두 개뿐이다.** seam-A(계좌 정보)는 `.env` 3키, seam-B(입금 관측)는 포트 1개. 그 외 계약·원장·대조·승인·노출은 배선 여부와 무관하게 지금 완성한다.

---

## 1. 현재 구현 실측 [확인]

| 항목 | 현재 | 근거 |
|---|---|---|
| 관리자 승인 | `activate_subscription()` 이 `ad.subscription_status = "active"` **한 줄**. 금액·입금일·입금자·기간·근거 기록 없음. `paid_until` 도 세팅하지 않음(227 컬럼은 있으나 쓰는 코드 없음 — dev 시드 스크립트만) | `backend/app/modules/ads/application.py:426-435`, `routers/admin_api/biz.py:823-843`, `scripts/seed_dev_ad_paid_contracts.py` |
| 감사로그 | `audit(db, session, request, "BIZ_AD_ACTIVATE_SUBSCRIPTION", "marketplace_ad", ad_id)` — detail 없음("누가 눌렀다"만) | `admin_api/_audit.py:17`, `biz.py:835` |
| 노출 게이트 | `subscription_status='active' AND paid_until >= 갱신유예컷오프` 또는 `pending_payment AND starts_at >= 신규유예컷오프`. 유예 3/5영업일, 휴일은 상수 튜플 | `services/ad_gating.py` (다른 워커 수정분, **무변경 유지**) |
| 계약 웹 게이트 | 앱 `POST /api/biz/ads/{id}/contract-link` → `marketplace_ads.contract_token` 발급 → 웹 무인증 GET/accept. 동의 기록은 **광고 행에 1:1**(`contract_accepted_at/method/signer_name/signer_ip`) → 갱신 계약 시 이전 이력이 덮인다 | `routers/ad_contract.py`, `models.py:1058-1063`, `init/176` |
| 계좌 안내 | `_BANK_TRANSFER_INFO_PLACEHOLDER` 하드코딩 한 문장 | `ad_contract.py:43-46` |
| 기간·금액 | 계약에 기간 개념 없음. `monthly_price_snapshot_vnd` 만. tier 월가격 199,000 / 499,000 은 DB(`ad_tiers`)에 있으나 **3M/6M 확정가(539k/999k, 1,349k/2,499k)는 어디에도 없다** | `init/150_ad_tier_prices.sql` |
| 어드민 콘솔 | 신규 SPA `admin-frontend/src/pages/biz/BizAdDetailPage.tsx:105-124` 에 "입금확인 (구독 활성)" Popconfirm 버튼(입력 0개). 레거시 `/admin-legacy/` 병행 | `admin-frontend/src/api/biz.ts:232` |
| 알림 | 승인 시 `noti_events.publish("biz.ad_reviewed", {result:"SUBSCRIPTION_ACTIVE"})` best-effort | `biz.py:838-842`, `services/noti_events.py` |
| 테스트 관례 | 실 DB 없이 mock db/순수함수 검증 (`app/tests/test_ad_contract.py`, `test_ad_paid_gate.py`) | 각 파일 docstring |
| `.env`↔`.env.example` | 키셋 동일(diff 0) 확인 | 본 세션 실측 |

---

## 2. A. 배선 경계(seam)

### 2-1. seam-B: 입금 관측 포트 `DepositSource`

**정의** — "이 계약건에 대해 얼마가 언제 입금됐는가" 를 알려주는 유일한 동작. 위치 후보 `backend/app/services/ad_payments/` (패키지).

```python
# services/ad_payments/port.py  — 포트: 값 객체 + 코어 진입점 1개
@dataclass(frozen=True)
class DepositObservation:
    amount_vnd: int                 # 양수. 환불은 kind="refund"
    paid_at: datetime               # aware. 은행 거래시각
    memo_raw: str | None            # 적요 원문 — 코드 추출 근거
    payer_name: str | None
    bank_ref: str | None            # 은행 거래참조번호
    source: Literal["manual", "csv", "bank_feed"]
    source_ref: str | None          # 소스 내 고유키(웹훅 id·CSV 행 해시). manual 은 None
    kind: Literal["deposit", "refund"] = "deposit"
    payment_code_hint: str | None = None   # 관리자가 직접 지정한 코드(manual). 없으면 memo_raw 에서 추출

async def ingest_deposit(db, obs: DepositObservation, *, actor: str) -> IngestResult:
    """코어. 어댑터가 무엇이든 이 함수 하나만 호출한다.
    1) code = payment_code_hint or extract_code(memo_raw)  → ad_contracts 특정 (없으면 contract_id=NULL 보관)
    2) UNIQUE(source, source_ref) 로 멱등 삽입 (중복이면 기존 행 반환, 상태 변경 없음)
    3) reconcile(contract) → status 갱신 (awaiting_payment|partially_paid|paid)
    4) 결과(매칭 여부·잔액·플래그) 반환. 승인은 하지 않는다.
    """
```

**어댑터 3종이 같은 포트에 꽂히는 증명** (①만 지금 구현):

| 어댑터 | 입력 → `DepositObservation` 매핑 | 진입 경로 | 구현 시점 |
|---|---|---|---|
| ① `manual` | 관리자 폼 `{contract_id, amount_vnd, paid_at, payer_name, bank_ref, note, evidence_content_id}` → `source="manual"`, `source_ref=None`, `payment_code_hint=계약의 코드` | admin API `POST /admin/api/biz/contracts/{id}/deposits` (계약 화면에서) · `POST /admin/api/biz/deposits`(미매칭 등록) | **Stage 1** |
| ② `csv` | 은행 명세서 행 `{거래일, 금액, 적요, 참조번호, 입금자}` → `source="csv"`, `source_ref=sha256(계좌·거래일·금액·참조번호)`, `memo_raw=적요` | admin API 업로드 1개(어댑터 파일 안에 라우터 포함) | 향후 — **포트 수용 확인만** |
| ③ `bank_feed` | 예: SePay 웹훅 `{id, transactionDate, transferAmount, content, referenceCode, code, transferType}` **[확인 — [SePay docs](https://docs.sepay.vn/tich-hop-webhooks.html)]** → `source="bank_feed"`, `source_ref=str(id)`, `memo_raw=content`, `bank_ref=referenceCode`, `kind = "deposit" if transferType=="in"`. 웹훅 인증 `Authorization: Apikey …` 헤더는 어댑터가 `.env` 키로 검증 | 웹훅 라우터(어댑터 파일 안) 또는 `app/jobs/` 폴링 | 향후 — **포트 수용 확인만** |

포트가 수용 가능한 근거: 세 소스가 제공하는 정보의 교집합(금액·시각·적요·참조)이 `DepositObservation` 필드와 1:1 이고, 소스마다 다른 것은 **`source`/`source_ref` 두 필드로만** 표현된다. 코어는 "어디서 왔나"를 멱등키로만 쓴다.

### 2-2. seam-A: 미배선 요소의 설정화 (`.env` 키)

**Stage 1 에 추가하는 키 — 3개.** 계좌 정보만이 "지금 전자적으로 확정할 수 없는 것"이다. 통화는 VND 고정(ADR 확정)이라 키로 빼지 않는다. 식별코드 접두어·입금 기한 일수는 정책이지 배선이 아니므로 코드 상수.

| 키 | `.env.example` 플레이스홀더 | 미설정 시 동작 |
|---|---|---|
| `AD_PAYMENT_BANK_NAME` | `` (빈 값) | 아래 "미배선 동작" |
| `AD_PAYMENT_BANK_ACCOUNT_NO` | `` (빈 값) | 〃 |
| `AD_PAYMENT_BANK_ACCOUNT_HOLDER` | `` (빈 값) | 〃 |

- 세 값이 **모두** 있어야 "배선됨"(`bank_wiring_ready() -> bool`). 하나라도 비면 미배선.
- **실제 계좌번호·예금주는 이 문서·`.env.example`·코드 어디에도 쓰지 않는다.** `.env` 에만.
- 비밀 아님(광고주에게 공개되는 정보)이라 `change_me_*` 대신 빈 값 — §4 규칙 5(공개 가능 항목은 기본값)에 부합하되, 기본값이 없으므로 빈 값.
- **[중요, F-3] `.env` 에 3키를 넣는 것만으로는 컨테이너에 전달되지 않는다.** 이 레포 `bff` 서비스는 `env_file` 이 아니라 `docker-compose.yml` 의 `environment:` **명시 allowlist** 방식으로 환경변수를 주입한다. 따라서 P1-3 은 `.env`·`.env.example` 갱신과 **함께** compose `bff.environment` 에 `AD_PAYMENT_BANK_NAME`/`AD_PAYMENT_BANK_ACCOUNT_NO`/`AD_PAYMENT_BANK_ACCOUNT_HOLDER` 3줄을 추가해야 실제로 `bank_wiring_ready()` 가 True 가 된다(§8 P1-3 참조).

**향후 어댑터 ③ 도입 시 추가되는 키 — 2개** (지금 넣지 않음. 소비 코드 없는 키는 §4 취지에 어긋난다):

| 키 | 플레이스홀더 | 용도 |
|---|---|---|
| `AD_PAYMENT_FEED_PROVIDER` | `manual` | `manual` 이면 어댑터 ③ 라우터/잡 미등록. `sepay` 등 값으로 활성 |
| `AD_PAYMENT_FEED_WEBHOOK_SECRET` | `change_me_ad_payment_feed_secret` | 웹훅 인증 |

(폴링형이면 `AD_PAYMENT_FEED_API_KEY` 가 SECRET 을 대체. VietQR 이미지까지 내려주려면 `AD_PAYMENT_BANK_BIN`(NAPAS 6자리 은행코드) 1개 추가 — Stage 2 선택.)

### 2-3. 미배선 상태의 동작 — 결정: **계약 동의는 허용, 입금 안내만 "준비 중", 대기 시계는 안내 표시 시점부터**

두 대안 비교:

| | (a) 계약 생성 자체를 막음 | (b) 동의까지 허용 + 입금 안내 "준비 중" ← **채택** |
|---|---|---|
| 파이프라인 테스트 | 미배선 dev 에서 ①②가 막혀 ③④⑤⑥을 못 돈다 → **대표 요구("미배선이어도 끝까지 돈다") 위반** | 동의 → 관리자 수동 입금등록(어댑터 ①은 계좌 정보 불필요) → 대조 → 승인 → 노출까지 전부 실행 가능 |
| 법적 의미 | — | 계약 동의와 결제 수단 안내는 별개 행위. 동의 시각·문안 스냅샷은 그대로 유효 |
| 광고주 혼란 | 없음 | "입금 안내 준비 중, 담당자가 연락" 문구로 명시. 이때 **입금 기한 카운트다운을 시작하지 않는다** |

(b) 의 함정 하나를 컬럼 1개로 막는다: `ad_contracts.payment_instructions_issued_at`. 계약 페이지 GET 시 `bank_wiring_ready()` 이고 이 값이 NULL 이면 세팅하고 상태를 `awaiting_payment` 로 올린다(멱등, 최초 1회). 입금 기한 = `issued_at + 7일`(상수, 조회 파생, 컬럼 없음). 미배선이면 계약은 `accepted` 에 머문다 → 관리자 목록에 "입금안내 미발급" 으로 보인다. 배선 후 광고주가 페이지를 다시 열면 자동 진행. **[대표 결정 D-A]** 7일 기한 확정 여부.

미배선 여부는 어드민 대시보드 상단에도 배너로 노출한다("계좌 미배선 — `.env` 3키 미설정"). 운영에서 미배선 상태로 계약이 쌓이는 사고를 눈에 보이게.

> **정정 [2026-09-07, P1-3/P1-4 리뷰 CHANGES 대응, 치명 4]**: 독립 리뷰에서 "미배선이면 계약은 `accepted` 에 머문다"를 "`accepted` 에서는 입금 대조도 하지 않는다"로 오독해 `port.py::_RECONCILABLE_STATUSES` 가 `accepted` 를 제외했고, 그 결과 미배선 상태에서는 관리자가 입금을 등록해도 승인까지 도달할 수 없어 §7 성공기준 ①이 성립하지 않았다. **감독 결정**: 이 문단은 **입금 안내(계좌 정보) 발급 시점**에 대한 규정이며, **대조(reconcile) 가능 여부**에 대한 규정이 아니다. 관리자가 입금건을 수동 등록하는 행위 자체가 "돈이 실제로 들어왔음"을 뜻하므로, 계좌 안내를 아직 못 했다는 사실이 이미 들어온 돈의 대조를 막을 이유가 없다. 따라서 `_RECONCILABLE_STATUSES` 는 `accepted` 를 포함한다(`awaiting_payment`/`partially_paid`/`paid` 와 동일하게 대조 가능). `accepted` 상태에서 정확 금액이 등록되면 `awaiting_payment` 를 거치지 않고 곧장 `paid` 로 전이할 수 있다 — 이는 정상 동작이다(입금 안내를 아직 못 봤어도 이미 돈은 들어왔으므로).

### 2-4. 은행 API 연동 시 변경 범위 — 파일 단위 증명

| 변경 | 파일 | 성격 |
|---|---|---|
| 어댑터 1개 | `backend/app/services/ad_payments/adapters/sepay_feed.py` (**신규**) — 웹훅 페이로드 → `DepositObservation` 매핑 + 서명 검증 + `APIRouter` 1개 | 신규 |
| 어댑터 등록 | `backend/app/services/ad_payments/adapters/__init__.py` — `PROVIDERS = {"manual": …, "sepay": sepay_feed}` 딕셔너리 1줄 | 1줄 |
| `.env` / `.env.example` | `AD_PAYMENT_FEED_PROVIDER`, `AD_PAYMENT_FEED_WEBHOOK_SECRET` 2키 (양쪽 동시) | 설정 |

**변경 없는 것**: `ad_contracts`/`ad_deposits` 스키마, `ingest_deposit()`·`reconcile()`·`approve()`, 어드민 화면(들어온 입금건이 `source='bank_feed'` 배지로 표시될 뿐), 계약 웹페이지, `ad_gating.py`, `main.py`(`adapters/__init__.py` 가 provider 에 따라 라우터를 내주는 `router` 를 이미 include 해 두므로). 폴링형이면 `app/jobs/` 등록 1줄이 웹훅 라우터를 대체한다.

만약 이 이상이 바뀌어야 한다면 경계가 잘못 그어진 것이다 — 특히 **어댑터가 상태를 직접 바꾸거나 `paid_until` 을 만지면 위반**. 어댑터는 관측만 만든다.

---

## 3. B. 데이터 모델

### 3-1. `ad_contracts` (계약건) — 광고 1 : 계약 N

| 컬럼 | 타입 | 이유 |
|---|---|---|
| `id` | UUID PK | |
| `ad_id` | UUID FK `marketplace_ads` ON DELETE RESTRICT, NOT NULL | 어느 광고의 계약인가. 계약이 있는 광고는 지우지 못하게(원장 보존) |
| `tier_id` | UUID FK `ad_tiers` RESTRICT, NOT NULL | 무엇을 샀나. 광고의 tier 가 나중에 바뀌어도 계약 시점 tier 보존 |
| `months` | SMALLINT NOT NULL CHECK IN (1,3,6) | 선불 기간(ADR §4-3) |
| `amount_vnd` | BIGINT NOT NULL | 계약 총액 스냅샷(tier×months 확정가). 대조의 기준값 |
| `payment_code` | VARCHAR(12) NOT NULL UNIQUE | 입금 식별코드(§3-4). 관리자·어댑터가 계약을 특정하는 키 |
| `status` | VARCHAR(20) NOT NULL | §4-1 상태기계. `expired` 는 저장하지 않음(파생) |
| `contract_token` | UUID NOT NULL UNIQUE | 웹 게이트 토큰(광고 행에서 이관). 계약마다 새 토큰 |
| `accepted_at` / `contract_method` / `signer_name` / `signer_ip` | TIMESTAMPTZ / VARCHAR(20) / VARCHAR(120) / VARCHAR(45), NULL | 동의 증거(광고 행 `contract_*` 에서 이관, 의미 동일) |
| `contract_snapshot` | JSONB NULL | 동의한 문안·버전·로케일·tier명·가격·sha256 (ADR T-4 가 광고 행에 두려던 것을 **여기로**) |
| `payment_instructions_issued_at` | TIMESTAMPTZ NULL | 계좌 안내가 실제로 표시된 시각(§2-3). 입금 기한 파생 기준 |
| `period_start` / `period_end` | TIMESTAMPTZ NULL | 승인 시 확정되는 유료 기간. `ad.paid_until` 의 근거 |
| `approved_at` / `approved_by` | TIMESTAMPTZ / VARCHAR(80) NULL | "왜 paid_until 이 이 값인가"를 행에서 바로 답하기 위해(감사로그와 중복이지만 조인 없이 목록에 표시) |
| `closed_at` / `closed_reason` | TIMESTAMPTZ / TEXT NULL | 취소·환불 종결 사유 |
| `created_at` | TIMESTAMPTZ NOT NULL | |

넣지 않은 것: `business_profile_id`(광고에서 파생), `kind(new/renewal)`(생성 시 `ad.paid_until` 유무로 파생), `due_at`(issued_at+7d 파생), `paid_amount`(입금건 합계 파생).

### 3-2. `ad_deposits` (입금건) — 계약 1 : 입금 N, 미매칭은 계약 NULL

| 컬럼 | 타입 | 이유 |
|---|---|---|
| `id` | UUID PK | |
| `contract_id` | UUID FK `ad_contracts` RESTRICT, **NULL 허용** | NULL = 미매칭(코드 누락·오입금) 보관. 매칭/재배정은 관리자 액션(audit) |
| `kind` | VARCHAR(10) NOT NULL CHECK IN ('deposit','refund') | 환불도 같은 원장에. 합계 = Σdeposit − Σrefund |
| `amount_vnd` | BIGINT NOT NULL CHECK > 0 | |
| `paid_at` | TIMESTAMPTZ NOT NULL | 은행 거래시각(등록 시각과 다름) |
| `payer_name` | TEXT NULL | 휴먼체크 근거 |
| `memo_raw` | TEXT NULL | 적요 원문 — 코드 추출·오입금 판단 근거 |
| `bank_ref` | TEXT NULL | 은행 거래참조 |
| `source` | VARCHAR(20) NOT NULL | `manual` / `csv` / `bank_feed` — 어댑터 식별 |
| `source_ref` | TEXT NULL | 소스 내 고유키. **`UNIQUE(source, source_ref) WHERE source_ref IS NOT NULL`** = 어댑터 ②③ 멱등키 |
| `evidence_content_id` | UUID FK `contents` SET NULL, NULL | 이체 확인 스크린샷(레포 규약: 이미지는 `contents` 중개) |
| `note` | TEXT NULL | 관리자 메모 |
| `recorded_by` | VARCHAR(80) NULL | manual 의 등록자(어댑터면 `'adapter:sepay'` 식 문자열) |
| `created_at` | TIMESTAMPTZ NOT NULL | |

넣지 않은 것: `status`(매칭 여부는 `contract_id IS NULL` 로 표현), `currency`(VND 고정), `matched_by`(재배정은 audit detail).

### 3-3. `ad_tiers` 기간 확정가 컬럼 2개

`price_3m_vnd BIGINT`, `price_6m_vnd BIGINT` 추가 (1개월 = 기존 `monthly_price_vnd`). 확정가 시드: 일반 539,000 / 999,000, 프리미엄 1,349,000 / 2,499,000. 계약 생성 시 `amount_vnd` 로 스냅샷. 별도 가격표 테이블은 기간이 3종 고정이라 과설계.

### 3-4. 기존 `MarketplaceAd` 필드 처리

| 필드 | 처리 | 근거 |
|---|---|---|
| `subscription_status`, `paid_until` | **유지 — 노출 캐시.** 쓰는 곳은 오직 `approve()`(active/paid_until)·환불 종결(§4-2)·dev 시드. 읽는 곳은 `ad_gating` 무변경 | 게이트를 계약 테이블 조인으로 바꾸면 4곳(market/biz/admin/dashboard)이 흔들린다. 캐시 갱신 지점을 한 함수로 좁히는 것이 안전 |
| `contract_token`, `contract_accepted_at`, `contract_method`, `contract_signer_name`, `contract_signer_ip` | **read-only 폴백** (레거시 `*_url` 관행). 신규 코드는 쓰지도 읽지도 않음. **백필 없음** — 서비스 미오픈이라 실 계약 0건 [확인 필요 — 운영 DB `SELECT count(*) FROM marketplace_ads WHERE contract_accepted_at IS NOT NULL`]. 0건이 아니면 티켓 P1-2 에 백필 1회 스크립트 추가 | ADR §1 "서비스 미오픈", dev 는 시드로 전부 active 전환됨 |
| `monthly_price_snapshot_vnd` | 유지(광고비 지표 `_ad_spend_for_period` 가 사용). 계약 `amount_vnd` 와 역할 다름 | `routers/biz.py:585-610` |
| 컬럼 DROP | 하지 않음(레거시 `*_url` 관행 동일). 별도 정리 티켓으로 | Karpathy #3 |

### 3-5. 입금 식별코드 생성 규칙

**형식**: `SGR-XXXXXXC` — 접두어 `SGR` + 하이픈 + 본문 6자 + 체크문자 1자 = **11자(하이픈 포함), 영숫자만 10자**.

| 항목 | 규칙 | 이유 |
|---|---|---|
| 문자셋 | Crockford Base32: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (I·L·O·U 제외, 32자) | 손글씨·구두 전달 시 0/O, 1/I/L 혼동 배제. U 제외는 욕설 조합 방지 |
| 본문 | 6자 무작위(`secrets.choice`) → 32⁶ ≈ 1.07×10⁹ 공간. 충돌은 `UNIQUE` 위반 시 재생성(최대 5회) | 계약 수천 건 규모에서 충돌 확률 무시 가능, DB 가 최종 보증 |
| 체크문자 | Σ(i+2)·vᵢ **mod 37** → 같은 문자셋 1자 (i = 0..5, vᵢ = 본문 문자 값). 값이 32~36 이면 본문 재생성(약 13.5%) | 1자 오타·인접 자리 바꿈 검출(가중치가 자리마다 달라 전위 오류도 잡힘). 관리자 검색창에서 즉시 "오타" 피드백 |

> **정정 2026-09-07 (P1-2 구현 중 발견)**: 최초 규격의 `mod 32` 는 위 "1자 오타 100% 검출" 요구를 **수학적으로 만족하지 못한다** — 가중치 2·4·6 이 32(=2⁵)와 공약수를 가져 특정 delta(예: 0번 자리 delta=16)가 체크문자를 바꾸지 못한다(전수 검사로 확인). 소수 `37` (최대 delta 31 및 모든 가중치보다 큼)로 바꾸면 delta·가중치차가 37 과 서로소가 되어 1자 치환·인접 전위 모두 100% 검출된다. 형식·길이·문자셋은 무변경.
| 정규화(입력·적요 추출) | 대문자화 → 영숫자 외 제거 → `O→0`, `I→1`, `L→1` → `SGR` 접두어 뒤 7자 매칭 | 은행 적요는 종종 대소문자·공백·하이픈이 훼손된다 |
| 적요 추출 | 정규식 `SGR[\s\-]?([0-9A-Z]{7})`, 1건이면 매칭, 0건/2건+ 면 미매칭 보관 | 어댑터 ②③ 의 `memo_raw` 에 공통 적용 |
| 표시 | 계약 페이지에 큰 글자 + 복사 버튼 + "적요란에 이 코드만 적어 주세요"(vi/ko/en) | 코드 누락이 오입금의 최대 원인 |

**은행 적요 제약 조사**:
- EMVCo Merchant-Presented QR 규격의 Additional Data(Tag 62) 하위 `08 Purpose of Transaction` 은 **ans 최대 25자** **[확인 — [EMVCo MPM v1.1](https://mvallim.github.io/emv-qrcode/docs/EMVCo-Merchant-Presented-QR-Specification-v1.1.pdf)]**. VietQR 은 이 규격 기반이므로 QR 로 코드를 실어 보내는 미래 옵션에서도 11자는 안전.
- 베트남 은행앱 수동 이체 적요란 길이·문자 제한(무다이어크리틱 강제 여부 등)은 은행별 상이하며 공개 규격을 찾지 못함 **[확인 필요 — 대표가 실제 수취 은행 확정 후 앱에서 실측]**. NAPAS 공식 페이지에 길이 명시 없음 [확인 — [napas.com.vn](https://napas.com.vn/dich-vu-chuyen-tien-nhanh-napas-247)]. 실무상 자동대조 서비스(SePay 등)가 "접두어+주문코드"를 적요에 쓰는 관행이 일반적임 **[추정 — [SePay](https://sepay.vn/lap-trinh-cong-thanh-toan.html)]**. 본 코드는 영숫자 10자로 어떤 제한에도 걸리지 않게 설계.

### 3-6. 마이그레이션

- `database/init/228_ad_contracts_deposits.sql` — 위 두 테이블 + `ad_tiers` 2컬럼 + 확정가 UPDATE. 전부 `IF NOT EXISTS` 멱등. 인덱스: `ad_contracts(ad_id)`, `ad_contracts(status)`, `ad_deposits(contract_id)`, 부분 UNIQUE `ad_deposits(source, source_ref) WHERE source_ref IS NOT NULL`.
- `docker-compose.yml` `bff_migrate`: `command` 에 `-f /migrations/228_…sql` + `-c INSERT INTO schema_migrations(version) VALUES (228) …` 쌍, `volumes` 에 `./database/init/228_…:/migrations/228_…:ro` — 227 등록 라인(`docker-compose.yml:439`, `:525`) 바로 아래.
- `models.py`: `AdContract`, `AdDeposit` ORM + `AdTier.price_3m_vnd/price_6m_vnd`.

---

## 4. C. 상태기계와 대조 로직

### 4-1. 계약건 상태 전이

```
 draft ──accept(웹)──▶ accepted ──안내 표시(bank_wiring_ready)──▶ awaiting_payment ──ingest──▶ partially_paid ──ingest──▶ paid ──approve(관리자)──▶ active
   │                     │                                          │                             │                        │                         │
   └──cancel──▶ cancelled◀┴──────────────cancel──────────────────────┴─────────────────────────────┘                        │                         │
                                                                                                                            └──refund 종결──▶ refunded◀┘
 (파생) active AND period_end < now  ⇒  "expired"  — 저장 안 함, 조회 시 계산. 배치 없음(기존 결정)
```

| 전이 | 누가 | 조건 | 부수효과 |
|---|---|---|---|
| `draft` 생성 | 앱 `contract-link` | 광고 소유 + `ad.review_status='APPROVED'` [확인 필요 — 현재는 `subscription_status=='pending_payment'` 만 검사; 갱신 계약은 active 광고에서도 만들어야 하므로 조건을 "APPROVED 이고 미종결 계약(draft~paid)이 없음"으로 바꾼다] | 토큰·코드 발급. 기존 draft 있으면 그 링크 재사용(멱등) |
| `accepted` | 웹 accept | `months ∈ {1,3,6}`, `signer_name` | `amount_vnd` 확정, 스냅샷, 동의 4필드 |
| `awaiting_payment` | 웹 GET (시스템) | `bank_wiring_ready()` | `payment_instructions_issued_at` |
| `partially_paid` / `paid` | `ingest_deposit` (시스템) | §4-2 합계 규칙 | |
| `active` | 관리자 approve | `status ∈ {paid, partially_paid}`(부분은 사유 필수) | §4-3 기간 산출, `ad.paid_until/subscription_status`, audit, 알림 |
| `cancelled` | 관리자 | `status ∉ {active, refunded}` | 입금건 있으면 환불 처리 후에만(합계 0 확인) |
| `refunded` | 관리자 | `active` 이고 refund 입금건 합계 = deposit 합계 | §4-2 환불 규칙 |

전이는 `services/ad_payments/contracts.py` 한 곳의 함수(`accept/issue_instructions/approve/cancel/close_refunded`)로만 일어난다. 라우터는 호출만.

### 4-2. 대조(reconcile) 규칙 — 시스템이 하는 것 / 사람이 판단하는 것

`received = Σ(kind=deposit) − Σ(kind=refund)` (매칭된 입금건만). `expected = amount_vnd`.

| 케이스 | 시스템(자동) | 사람(관리자 화면에서) |
|---|---|---|
| 정확 일치 `received == expected` | `status=paid`. 플래그 없음 | **승인 버튼** 클릭. 입금자명·입금일 눈 확인 |
| 부족 `0 < received < expected` | `status=partially_paid`, 잔액 표시 | 기다리거나 광고주 연락. **부분 승인**은 사유 입력 필수(audit detail 에 `shortfall_vnd`, `reason`) — 정책상 원칙 불허, 예외만 |
| 초과 `received > expected` | `status=paid` + 플래그 `overpaid(+Δ)` | 초과분 처리 결정: refund 입금건 등록(§refund) 또는 광고주 합의로 다음 계약에 이월(**[대표 결정 D-B]** 이월 허용 여부. 허용하면 미매칭 입금건을 새 계약에 재배정하는 것으로 표현 — 새 개념 불필요) |
| 분할 입금 | 합계 규칙으로 자연 처리. 입금건 N행 | 없음 |
| 중복 입금(같은 거래가 두 번 들어옴) | 어댑터 ②③: `UNIQUE(source, source_ref)` 위반 → 무시(기존 행 반환). 어댑터 ①: 같은 계약·같은 금액·`paid_at` ±1일 기존 행 있으면 **경고 응답**(409 + 기존 행 id) | 경고 보고 "진짜 두 번 입금됐다"면 `force=true` 재요청(audit detail `duplicate_override=true`) |
| 코드 누락/훼손 | 코드 추출 실패 → `contract_id=NULL` 보관, "미매칭" 탭에 표시 | 입금자명·금액으로 후보 계약(같은 금액 + `awaiting_payment/partially_paid`) 제안 목록에서 **수동 배정**(audit `BIZ_AD_DEPOSIT_MATCH`, detail 에 `before_contract_id=null`) |
| 타 계약 코드로 입금 | 코드대로 매칭(시스템은 의도를 모른다). 단 `payer_name` 이 해당 계약 광고의 `partner_name` 과 불일치하고 금액이 `expected` 와도 다르면 플래그 `check_payer` | 플래그 보고 **재배정**(audit `BIZ_AD_DEPOSIT_MATCH`, `before/after contract_id`). 재배정 시 두 계약 모두 재대조 |
| 환불 | `kind=refund` 입금건 등록(어댑터 ① 폼, `paid_at`=송금일) → 해당 계약 `received` 감소 → 상태 재계산. **active 계약**에 refund 가 합계를 0으로 만들면 관리자가 `close_refunded` 실행 가능 | 환불 송금은 사람이 은행에서 실행. 시스템은 기록만. active 환불 종결 시 `ad.paid_until` 처리: 그 계약이 **최신 계약**이면 `paid_until = period_start`(연장 취소, 과거면 노출 중단·유예 적용) / 최신이 아니면 **[대표 결정 D-C]** (원칙: 불가, 수동 조정) |

플래그(`overpaid`, `check_payer`, `duplicate_suspect`)는 저장하지 않고 조회 시 계산해 응답에 싣는다 — 저장하면 재대조 때마다 갱신 누락 위험.

### 4-3. 승인 시 `paid_until` 산출

```
prev = ad.paid_until
grace_floor = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)     # ad_gating 의 함수 재사용
period_start = prev            if prev is not None and prev >= grace_floor   # 연속(만료 전 또는 유예 내 갱신) → 이어붙임
             = now             otherwise                                     # 최초 계약, 또는 유예 지나 끊긴 뒤 재계약
period_end   = period_start + relativedelta(months=months)                  # 달력월(말일 클램프)
ad.paid_until = period_end ; ad.subscription_status = "active"
```

- 유예기간 안에 갱신하면 `prev`(과거일 수 있음)부터 이어붙인다 — 유예 중 노출은 이미 제공됐으므로 공짜 일수가 생기지 않는다. 유예를 넘겨 노출이 끊긴 뒤라면 승인 시점부터.
- 신규 계약 유예(3영업일, `starts_at` 기준)는 게이트가 이미 처리하므로 여기서 건드리지 않음.
- 광고비 지표(`/30` 안분)는 `paid_until` 을 그대로 상한으로 쓰면 됨(ADR T-2).

### 4-4. 멱등성과 감사

| 위험 | 방어 |
|---|---|
| 같은 입금건 두 번 → 기간 두 번 연장 | **기간 연장은 입금건이 아니라 계약 승인에서만** 일어난다(계약 1건 = 승인 1회). 입금건 중복은 §4-2 로 막고, 설령 들어와도 `received` 만 커진다(overpaid 플래그) |
| 승인 두 번 클릭 | `approve()` 는 `status != 'active'` 를 `UPDATE … WHERE status IN ('paid','partially_paid')` 로 원자 검사 → 두 번째는 409 |
| 어댑터 재전송(웹훅 리트라이 — SePay 는 최대 7회 [확인]) | `UNIQUE(source, source_ref)` |
| 감사 | 기존 `audit(db, session, request, action, target_type, target_id, detail)` 그대로. 액션: `BIZ_AD_CONTRACT_APPROVE`(detail: `contract_id, ad_id, months, amount_vnd, received_vnd, deposit_ids[], prev_paid_until, period_start, period_end, shortfall_vnd?, reason?`), `BIZ_AD_DEPOSIT_RECORD`(detail: 관측 필드 전부 + `duplicate_override?`), `BIZ_AD_DEPOSIT_MATCH`(`before_contract_id, after_contract_id, reason`), `BIZ_AD_CONTRACT_CANCEL/REFUND_CLOSE`(`reason`). 어댑터 ②③ 는 admin 세션이 없으므로 `recorded_by='adapter:<provider>'` 를 행에 남기고 audit 은 생략(행 자체가 원장) |
| 알림 | 승인 시 기존 `noti_events.publish("biz.ad_reviewed", {result:"SUBSCRIPTION_ACTIVE"})` 유지(핸들러 이미 존재). 입금 접수 알림은 Stage 2 |

---

## 5. D. 사람이 쓰는 화면 흐름

### 5-1. 어디에 붙이나 — **`admin-frontend/`(React SPA)**

레거시는 2차 이식 완료 시 폐기 예정이고, 현재 활성화 버튼도 SPA(`BizAdDetailPage`)에 있다. 레거시에는 아무것도 추가하지 않는다.

### 5-2. 관리자 (admin-frontend)

**화면 1 — 계약·입금 목록** `/biz/contracts` (신규 `BizContractListPage.tsx`)
- 상단 배너: 계좌 미배선이면 경고(§2-3).
- 탭: `입금대기`(awaiting_payment·partially_paid·paid — 기본) / `안내미발급`(accepted) / `미매칭 입금`(deposits.contract_id NULL) / `전체`.
- 검색창 1개: **식별코드**(정규화·체크문자 검증 → 오타 즉시 표시) 또는 업체명. 은행앱에서 본 코드를 그대로 붙이는 동선.
- 행: 코드 · 업체명(`partner_name`) · tier·기간 · 계약금액 · 입금합계/잔액 · 상태 배지 · 입금기한(`issued_at+7d`, 초과 시 빨강) · 플래그.

**화면 2 — 계약 상세** `/biz/contracts/:id` (신규 `BizContractDetailPage.tsx`) — **휴먼체크가 성립하려면 한 화면에 이것들이 같이 있어야 한다**:
1. 계약 요약: 코드(큼) · 업체명 · 광고 제목(→ 광고 상세 링크) · tier · 기간 · **계약금액** · 동의 시각/서명자/IP · 문안 버전.
2. 입금건 표: 입금일 · 금액 · 입금자명 · 적요 원문 · 참조 · 소스 배지(manual/csv/bank_feed) · 증빙 썸네일(`<AppImage>` 상당) · 등록자.
3. 대조 패널: `expected / received / 잔액` + 플래그(overpaid·check_payer·duplicate_suspect) + 승인 후 예상 `period_start → period_end`(§4-3 를 미리 계산해 보여준다 — "승인하면 언제까지 노출되는지"를 클릭 전에 안다).
4. 액션: **입금건 등록**(모달: 금액·입금일·입금자명·참조·메모·증빙 업로드 — 어댑터 ①) / **승인**(정확 일치면 확인만, 부족이면 사유 입력 강제) / 취소 / 환불건 등록 / (미매칭 탭에서) 배정.
5. 감사 이력: 이 계약을 target 으로 한 `admin_audit_log` 행.

**기존 `BizAdDetailPage` 의 "입금확인 (구독 활성)" 버튼은 제거**하고 "계약 보기 (N건)" 링크로 대체. 기존 `POST /admin/api/biz/ads/{id}/activate-subscription` 은 **삭제**(원장 우회 경로를 남기면 `paid_until` 없는 active 가 다시 생긴다). dev 전용 우회는 `seed_dev_ad_paid_contracts.py` 로 충분.

**관리자 API** (`routers/admin_api/biz_contracts.py` 신규):
- `GET /admin/api/biz/contracts?tab=&q=` · `GET /admin/api/biz/contracts/{id}`(입금건·대조·예상기간 포함)
- `POST /admin/api/biz/contracts/{id}/deposits`(어댑터 ①) · `POST /admin/api/biz/deposits`(미매칭 등록) · `POST /admin/api/biz/deposits/{id}/match {contract_id, reason}`
- `POST /admin/api/biz/contracts/{id}/approve {reason?}` · `POST …/cancel {reason}` · `POST …/close-refunded {reason}`
- `GET /admin/api/biz/payment-wiring` → `{ready: bool, missing_keys: [...]}`(배너용. 값은 절대 내려주지 않고 키 이름만)

### 5-3. 광고주

**앱(`BizManage.tsx`)** — 변경 최소: 버튼은 그대로 "웹에서 계약하기"(iOS 하향은 ADR D-1/T-6 그대로). 광고 카드에 **상태만** 표시: `계약 필요 / 입금 대기 / 확인 중 / 게시중(~9월 30일) / 만료`. 금액·계좌·코드는 **앱에 표시하지 않는다**(Apple 3.1.1, 확정).

**웹 `apply?token=`** (`landing/apps/client/src/pages/apply/Index.tsx`, `adContractApi.ts`)
1. `draft`: tier명 + **기간 3택(1/3/6개월, 확정가 표시)** + 문안(서버 SoT) + 체크박스 + 서명자명 → accept.
2. `accepted`(미배선): "계약이 완료됐습니다. 입금 안내는 준비 중이며 담당자가 연락드립니다."(vi/ko/en). 코드는 이미 보여준다(나중에 안내가 열려도 코드는 같다).
3. `awaiting_payment / partially_paid`: **입금 안내 카드** — 은행명 · 계좌번호(복사) · 예금주 · 금액(잔액) · **식별코드(큼, 복사)** · "적요란에 코드만" 안내 · 기한. 아래에 "입금 확인 상태: 접수 N건 / 잔액" (같은 GET 을 새로고침).
4. `paid`: "입금 확인됨, 관리자 승인 대기(영업일 1일 내)".
5. `active`: "게시중 · ~period_end" + 계약 사본(스냅샷 렌더·인쇄, ADR E-3).
6. `cancelled/refunded/expired(파생)`: 종결 문구 + (만료면) 앱에서 재계약 안내.

`GET /public/ad-contract/{token}` 응답 확장: `status, months, amount_vnd, payment_code, received_vnd, due_at, bank: {name, account_no, holder} | null, period_start, period_end, contract_text, contract_text_version, snapshot?`. `bank=null` 이 미배선 신호.

---

## 6. 대표 결정이 필요한 잔여 항목

| # | 결정 | 기본안 |
|---|---|---|
| D-A | 입금 기한(안내 표시 후 N일) 및 초과 시 처리(자동 취소 없음 — 관리자 목록 빨강만) | 7일, 자동 취소 없음 |
| D-B | 초과 입금분 이월 허용 여부 | 허용(미매칭 입금건을 다음 계약에 재배정으로 표현) |
| D-C | 최신이 아닌 active 계약의 환불 시 `paid_until` 처리 | 시스템 자동 조정 불가 → 관리자 수동, 문서화만 |
| D-D | 부분 승인(부족 금액 승인) 허용 여부 | 허용하되 사유 필수·audit |
| D-E | 은행 피드 도입 시 "정확 일치면 자동 승인" 허용 여부 | Stage 1 은 항상 사람 승인. 결정 시 `approve()` 를 어댑터 ③ 후처리에서 호출하는 플래그 1개로 끝남(본체 무변경) |
| Q-A | 실 수취 은행 확정(ADR Q-1) 후 그 은행앱 적요란 길이·문자 제한 실측 | — |
| Q-B | 운영 DB 에 `contract_accepted_at IS NOT NULL` 광고가 있는지(백필 필요 여부) | 0건 가정 |

---

## 7. 검증 가능한 성공 기준 (미배선 상태 e2e)

dev(`.env` 계좌 3키 비움)에서: 광고 APPROVED → 앱 contract-link → 웹 accept(3개월) → 계약 `accepted`, 페이지에 "준비 중"+코드 → 어드민 입금건 등록(정확 금액, 코드 검색) → `paid` → 승인 → `active`, `ad.paid_until = now+3M`, audit detail 에 금액·입금건 id → `public_ads()` 에 노출. 이어서 `.env` 3키 채우고 재시작 → 같은 페이지 GET 이 `awaiting_payment` 로 올라가며 계좌 카드 표시. **이 두 시나리오가 통과하면 "구현됐으나 미배선" 상태가 성립한 것이다.**

> **정정 [2026-09-07]**: 위 문단이 이미 "계약 `accepted` → 어드민 입금건 등록 → `paid`"를 성공 기준으로 명시하고 있었음에도, 구현(`port.py::_RECONCILABLE_STATUSES`)이 `accepted` 를 대조 가능 상태에서 빠뜨려 실제로는 `accepted` 에서 막혔다(리뷰 CHANGES, 치명 4). §2-3 정정과 함께 `_RECONCILABLE_STATUSES` 에 `accepted` 를 포함해 바로잡았다 — `backend/app/services/ad_payments/port.py`, `backend/app/tests/test_ad_payment_pipeline_e2e.py`(미배선 e2e).

---

## 8. 구현 티켓

ADR §9 대응: **T-3 → P1-4/P1-5 로 대체**, **T-4 → P1-2(스냅샷은 `ad_contracts` 에) 로 이관**, **T-6 의 계좌 문구 → P1-3 으로 대체**(나머지 T-6 iOS 하향·사본은 그대로 별건). T-1(완료)·T-2·T-5 는 무영향.

### Stage 1 (지금 구현) — 의존 순서대로

| # | 제목 | 파일 후보 | 검증(테스트) | 의존 |
|---|---|---|---|---|
| **P1-1** | 스키마·ORM·시드 | `database/init/228_ad_contracts_deposits.sql` · `docker-compose.yml`(command+volumes) · `models.py`(`AdContract`, `AdDeposit`, `AdTier.price_3m/6m`) | `bff_migrate` 재실행 멱등(2회 실행 오류 0) · ORM 컴파일 · `ad_tiers` 확정가 6값 SELECT 일치 | — |
| **P1-2** | 식별코드 + 포트·코어 | `services/ad_payments/__init__.py`, `port.py`(`DepositObservation`, `ingest_deposit`), `payment_code.py`(생성·체크·정규화·적요 추출), `reconcile.py`, `contracts.py`(상태 전이 5함수·`compute_period`), `config.py`(`bank_wiring_ready`, 3키 읽기), `adapters/__init__.py`(registry, `manual` 만) | `tests/test_ad_payment_code.py`: 문자셋에 I/L/O/U 없음 · 체크문자로 1자 오타/인접 전위 100% 검출(전수) · `O→0,I→1,L→1` 정규화 · 적요 추출 0/1/2건 케이스 · `tests/test_ad_payment_reconcile.py`: §4-2 8케이스 상태·플래그 · `tests/test_ad_contract_period.py`: §4-3 (최초/만료전 갱신/유예 내/유예 후/말일 클램프) · `ingest_deposit` 멱등(같은 source_ref 2회 → 행 1) | P1-1 |
| **P1-3** | `.env` 3키 + compose 배선 + 계약 웹 라우터 재작성 | `.env.example`·`.env`(**동시**) · `docker-compose.yml`(`bff.environment` 에 `AD_PAYMENT_BANK_NAME`/`AD_PAYMENT_BANK_ACCOUNT_NO`/`AD_PAYMENT_BANK_ACCOUNT_HOLDER` 3줄 추가 — `bff` 는 `env_file` 이 아니라 `environment:` 명시 allowlist 라 `.env` 만으로는 컨테이너에 전달 안 됨, F-3) · `routers/ad_contract.py`(계약 테이블 기준으로 재작성: contract-link 가 draft 생성/재사용, GET 응답 확장, accept 에 `months`, `issue_instructions` 멱등) · `_BANK_TRANSFER_INFO_PLACEHOLDER` 삭제 | `tests/test_ad_contract.py` 재작성: 미배선 GET → `bank=null`, 상태 `accepted` 유지 / 배선 GET → `awaiting_payment` + issued_at 1회만(컨테이너 재빌드 후 실측 확인 — compose 3줄 누락 시 미배선으로 남는 것까지 확인) / accept 멱등·`months∉{1,3,6}` 422 / 갱신(active 광고) 도 draft 생성 가능 / `.env`↔`.env.example` 키셋 diff 0 | P1-2 |
| **P1-4** | 관리자 API(어댑터 ①) | `routers/admin_api/biz_contracts.py`(신규, §5-2 엔드포인트) · `admin_api/biz.py` 의 `activate-subscription` 삭제 · `modules/ads/application.py activate_subscription` 삭제(고아) · `main.py` include | `tests/test_admin_biz_contracts.py`: 승인 → `ad.paid_until/subscription_status` 갱신 + audit detail 키 전부 존재 / 승인 2회 → 409 / 부족 승인 사유 없음 → 422 / manual 중복 경고 409 → `force` 통과 detail 에 `duplicate_override` / 미매칭 배정 audit before/after / `payment-wiring` 응답에 값 없음(키 이름만) | P1-2 |
| **P1-5** | admin-frontend 화면 | `admin-frontend/src/pages/biz/BizContractListPage.tsx`, `BizContractDetailPage.tsx`(신규) · `api/biz.ts`(훅) · `App.tsx` 라우트 2개 · `BizAdDetailPage.tsx`·`BizAdListPage.tsx` 활성화 버튼 제거→계약 링크 · 미배선 배너 | `tsc -b` 0 · ESLint error 0 · 활성화 mutation 참조 0건(grep) · 어드민배포 후 목록/상세 200 | P1-4 |
| **P1-6** | 계약 웹페이지 | `landing/apps/client/src/pages/apply/Index.tsx`, `lib/adContractApi.ts`, `content.ts`(3로케일: 기간 선택·준비 중·입금 카드·상태 6종) | 랜딩 빌드 0 에러 · 로케일 3벌 키 패리티 · 상태 6종 렌더 스냅샷 | P1-3 |
| **P1-7** | 앱 상태 배지 | `frontend/src/pages/biz/BizManage.tsx` + `api/biz.ts` 타입(광고 응답에 `contract_status` 파생 1필드) · 로케일 3벌 | 가격·계좌·코드 문자열이 앱 번들에 없음(grep) · 계약 테스트: 상태 5종 라벨 | P1-3 |
| **P1-8** | 문서 동기화·재인덱싱 | `ai-docs/context/current.md`, `schema/erd.md`(테이블 2종), `codebase-memory index_repository`(moderate) | — | 전부 |

### Stage 2 이후 (포트 수용 증명만 해두고 지금 만들지 않음)

| # | 제목 | 변경 범위 |
|---|---|---|
| S2-1 | 어댑터 ② CSV 명세서 | `adapters/csv_statement.py` 1파일(파서+업로드 라우터) + registry 1줄 |
| S2-2 | 어댑터 ③ 은행 피드(SePay 등) | `adapters/<provider>_feed.py` 1파일 + registry 1줄 + `.env` 2키(§2-4) |
| S2-3 | VietQR 이미지(코드 내장) | `.env` `AD_PAYMENT_BANK_BIN` 1키 + 계약 페이지 QR 렌더 |
| S2-4 | 입금 접수 알림 · 기한 초과 알림 | `noti_events` 이벤트 2종(ADR T-5 스케줄러에 편승) |
| S2-5 | 정확 일치 자동 승인(D-E) | 어댑터 후처리 플래그 1개 |

---

## 부록 A. 출처

- EMVCo Merchant-Presented QR Specification v1.1 — Tag 62/08 Purpose of Transaction ans..25: https://mvallim.github.io/emv-qrcode/docs/EMVCo-Merchant-Presented-QR-Specification-v1.1.pdf
- NAPAS 247 / VietQR 서비스 안내(길이 규정 없음): https://napas.com.vn/dich-vu-chuyen-tien-nhanh-napas-247
- SePay 웹훅 페이로드·인증·재시도: https://docs.sepay.vn/tich-hop-webhooks.html · 적요 접두어+주문코드 관행: https://sepay.vn/lap-trinh-cong-thanh-toan.html
- Crockford Base32 문자셋: https://www.crockford.com/base32.html
