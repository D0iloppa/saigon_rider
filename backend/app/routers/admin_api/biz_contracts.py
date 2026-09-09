"""admin JSON API — 광고 계약·입금·대조·승인 (260907_ad_payment_pipeline_design.md §5-2, P1-4).

관리자가 입금을 계약건에 묶어 휴먼체크로 승인하는 경로. 상태 전이는 `services/ad_payments/contracts.py`
5함수, 입금 관측은 `services/ad_payments/port.py::ingest_deposit()`, 대조는
`services/ad_payments/reconcile.py::reconcile_contract()` 를 그대로 호출만 한다(코어 수정 없음).

구버전 승인 경로(`biz.py` 의 `activate-subscription`)는 이 라우터로 대체되며 삭제된다.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import AdContract, AdDeposit, BusinessProfile, MarketplaceAd
from ...services import noti_events
from ...services.ad_payments import checkout as checkout_core
from ...services.ad_payments import config as payment_config
from ...services.ad_payments import constants as payment_constants
from ...services.ad_payments import contracts as payment_contracts
from ...services.ad_payments import payment_code
from ...services.ad_payments.contracts import ContractStateError
from ...services.ad_payments.port import RECONCILABLE_STATUSES, DepositObservation, ingest_deposit
from ...services.ad_payments.rails import RAILS, RailNotSupported, RailValidationError
from ...services.ad_payments.rails.toss_card import TossApiError
from ...services.ad_payments.reconcile import ReconcileResult, reconcile_contract
from ._audit import audit

router = APIRouter(prefix="/biz")

# port.py 가 export 하는 `RECONCILABLE_STATUSES` 를 SoT 로 그대로 쓴다(§4-1) — 리터럴 중복 제거.
# 감독 결정(치명 4): 관리자의 수동 입금 등록은 미배선 여부와 무관하게 "돈이 실제로 들어왔음"을
# 뜻하므로 accepted 도 대조 가능 상태에 포함한다(§7 미배선 e2e 성공기준).
_RECONCILABLE_STATUSES = RECONCILABLE_STATUSES

# 계좌 배선 3키 — 값은 config.py 에서만 읽는다(§2-2). 키 이름 자체도 config.py 를 SoT 로 삼아
# 읽기 전용 import 한다(이중 SoT 제거 — [경미] 지적).
_BANK_ENV_KEYS = payment_config.BANK_ENV_KEYS

_TAB_STATUSES: dict[str, tuple[str, ...] | None] = {
    "awaiting": ("awaiting_payment", "partially_paid", "paid"),
    "unissued": ("accepted",),
    "all": None,
}

# 중복 입금 의심 판정 창(§4-2) — 같은 계약·같은 금액·paid_at 이 이 간격 이내.
_DUPLICATE_SUSPECT_WINDOW = timedelta(days=1)


# ── 요청/응답 모델 ────────────────────────────────────────────────────────


class DepositCreateRequest(BaseModel):
    kind: Literal["deposit", "refund"] = "deposit"
    amount_vnd: int = Field(gt=0)
    paid_at: datetime
    payer_name: str | None = None
    bank_ref: str | None = None
    memo_raw: str | None = None
    note: str | None = None
    evidence_content_id: uuid.UUID | None = None
    force: bool = False


class UnmatchedDepositCreateRequest(DepositCreateRequest):
    payment_code_hint: str | None = None


class DepositMatchRequest(BaseModel):
    contract_id: uuid.UUID
    reason: str


class ApproveRequest(BaseModel):
    reason: str | None = None


class ReasonRequest(BaseModel):
    reason: str


class RailSyncRequest(BaseModel):
    ref: str = Field(min_length=1)


class RailRefundRequest(BaseModel):
    deposit_id: uuid.UUID
    amount_vnd: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=1)


class DepositRow(BaseModel):
    id: uuid.UUID
    contract_id: uuid.UUID | None
    kind: str
    amount_vnd: int
    paid_at: datetime
    payer_name: str | None
    memo_raw: str | None
    bank_ref: str | None
    source: str
    source_ref: str | None
    evidence_content_id: uuid.UUID | None
    note: str | None
    recorded_by: str | None
    charge_snapshot: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReconcileOut(BaseModel):
    status: str
    received_vnd: int
    expected_vnd: int
    shortfall_vnd: int
    overpaid_vnd: int
    flags: list[str]


class ContractRow(BaseModel):
    id: uuid.UUID
    ad_id: uuid.UUID
    ad_title: str
    partner_name: str
    payment_code: str
    months: int
    amount_vnd: int
    status: str
    received_vnd: int
    shortfall_vnd: int
    flags: list[str]
    payment_instructions_issued_at: datetime | None
    due_at: datetime | None
    overdue: bool
    created_at: datetime


class ContractDetail(BaseModel):
    id: uuid.UUID
    ad_id: uuid.UUID
    ad_title: str
    partner_name: str
    payment_code: str
    months: int
    amount_vnd: int
    status: str
    contract_token: uuid.UUID
    accepted_at: datetime | None
    contract_method: str | None
    signer_name: str | None
    signer_ip: str | None
    payment_instructions_issued_at: datetime | None
    due_at: datetime | None
    overdue: bool
    period_start: datetime | None
    period_end: datetime | None
    approved_at: datetime | None
    approved_by: str | None
    closed_at: datetime | None
    closed_reason: str | None
    created_at: datetime
    deposits: list[DepositRow]
    reconcile: ReconcileOut
    projected_period_start: datetime | None
    projected_period_end: datetime | None


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────


def _reconcile_out(outcome: ReconcileResult) -> ReconcileOut:
    return ReconcileOut(
        status=outcome.status,
        received_vnd=outcome.received_vnd,
        expected_vnd=outcome.expected_vnd,
        shortfall_vnd=outcome.shortfall_vnd,
        overpaid_vnd=outcome.overpaid_vnd,
        flags=sorted(outcome.flags),
    )


def _due_at(contract: AdContract) -> datetime | None:
    if contract.payment_instructions_issued_at is None:
        return None
    return contract.payment_instructions_issued_at + timedelta(days=payment_constants.PAYMENT_DUE_DAYS)


def _overdue(contract: AdContract, due_at: datetime | None, now: datetime) -> bool:
    if due_at is None or due_at >= now:
        return False
    return contract.status not in ("active", "cancelled", "refunded")


async def _get_contract_or_404(db: AsyncSession, contract_id: uuid.UUID) -> AdContract:
    contract = await db.get(AdContract, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="contract not found")
    return contract


async def _get_ad_or_404(db: AsyncSession, ad_id: uuid.UUID) -> MarketplaceAd:
    ad = await db.get(MarketplaceAd, ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="ad not found")
    return ad


async def _deposits_for_contract(db: AsyncSession, contract_id: uuid.UUID) -> list[AdDeposit]:
    result = await db.execute(select(AdDeposit).where(AdDeposit.contract_id == contract_id).order_by(AdDeposit.paid_at))
    return list(result.scalars().all())


async def _reconcile(db: AsyncSession, contract: AdContract, *, partner_name: str | None = None) -> ReconcileResult:
    deposits = await _deposits_for_contract(db, contract.id)
    return reconcile_contract(expected_vnd=contract.amount_vnd, deposits=deposits, partner_name=partner_name)


async def _find_duplicate_suspect(
    db: AsyncSession, contract_id: uuid.UUID | None, kind: str, amount_vnd: int, paid_at: datetime
) -> AdDeposit | None:
    """§4-2 "중복 입금(manual)" — 같은 계약(또는 미매칭)·같은 kind·같은 금액·paid_at ±1일 기존 행.

    [중 5] kind 를 안 가리면 정당한 동액 환불이 기존 입금과 겹쳐 409 로 막힌다(반대로 진짜
    중복 환불은 입금과 안 겹쳐 미탐지). 입금은 입금끼리, 환불은 환불끼리만 비교한다.
    contract_id=None(미매칭 등록)이면 다른 미매칭 행끼리만 비교한다 — 계약에 매칭된 행과는
    섞지 않는다(code-review 지적: create_unmatched_deposit 이 이 검사를 아예 안 거쳐 같은
    미배정 오입금이 재시도로 두 번 쌓일 수 있었다).
    """
    contract_filter = AdDeposit.contract_id.is_(None) if contract_id is None else AdDeposit.contract_id == contract_id
    result = await db.execute(
        select(AdDeposit).where(
            contract_filter,
            AdDeposit.kind == kind,
            AdDeposit.amount_vnd == amount_vnd,
            AdDeposit.paid_at >= paid_at - _DUPLICATE_SUSPECT_WINDOW,
            AdDeposit.paid_at <= paid_at + _DUPLICATE_SUSPECT_WINDOW,
        )
    )
    return result.scalars().first()


async def _contract_detail(db: AsyncSession, contract: AdContract) -> ContractDetail:
    ad = await _get_ad_or_404(db, contract.ad_id)
    deposits = await _deposits_for_contract(db, contract.id)
    outcome = reconcile_contract(expected_vnd=contract.amount_vnd, deposits=deposits, partner_name=ad.partner_name)
    due_at = _due_at(contract)
    now = datetime.now(UTC)
    projected_start, projected_end = payment_contracts.compute_period(
        prev_paid_until=ad.paid_until, months=contract.months, now=now
    )
    return ContractDetail(
        id=contract.id,
        ad_id=ad.id,
        ad_title=ad.title,
        partner_name=ad.partner_name,
        payment_code=contract.payment_code,
        months=contract.months,
        amount_vnd=contract.amount_vnd,
        status=contract.status,
        contract_token=contract.contract_token,
        accepted_at=contract.accepted_at,
        contract_method=contract.contract_method,
        signer_name=contract.signer_name,
        signer_ip=contract.signer_ip,
        payment_instructions_issued_at=contract.payment_instructions_issued_at,
        due_at=due_at,
        overdue=_overdue(contract, due_at, now),
        period_start=contract.period_start,
        period_end=contract.period_end,
        approved_at=contract.approved_at,
        approved_by=contract.approved_by,
        closed_at=contract.closed_at,
        closed_reason=contract.closed_reason,
        created_at=contract.created_at,
        deposits=[DepositRow.model_validate(d) for d in deposits],
        reconcile=_reconcile_out(outcome),
        projected_period_start=projected_start,
        projected_period_end=projected_end,
    )


# ── 목록·상세 ─────────────────────────────────────────────────────────────


@router.get("/contracts", response_model=list[ContractRow], summary="계약·입금 목록 (탭·검색)")
async def list_contracts(
    tab: str = Query("awaiting"),
    q: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if tab not in _TAB_STATUSES:
        raise HTTPException(status_code=400, detail="invalid tab")

    query = select(AdContract, MarketplaceAd).join(MarketplaceAd, MarketplaceAd.id == AdContract.ad_id)
    statuses = _TAB_STATUSES[tab]
    if statuses is not None:
        query = query.where(AdContract.status.in_(statuses))

    if q:
        normalized_q = payment_code.normalize(q)
        if normalized_q.startswith(payment_code.PREFIX):
            code = payment_code.parse_and_validate(q)
            if code is None:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "invalid_payment_code",
                        "message": "식별코드 형식이 올바르지 않습니다 (오타 의심)",
                    },
                )
            query = query.where(AdContract.payment_code == code)
        else:
            query = query.where(MarketplaceAd.partner_name.ilike(f"%{q}%"))

    query = query.order_by(AdContract.created_at.desc())
    rows = (await db.execute(query)).all()

    now = datetime.now(UTC)
    out: list[ContractRow] = []
    for contract, ad in rows:
        deposits = await _deposits_for_contract(db, contract.id)
        outcome = reconcile_contract(expected_vnd=contract.amount_vnd, deposits=deposits, partner_name=ad.partner_name)
        due_at = _due_at(contract)
        out.append(
            ContractRow(
                id=contract.id,
                ad_id=ad.id,
                ad_title=ad.title,
                partner_name=ad.partner_name,
                payment_code=contract.payment_code,
                months=contract.months,
                amount_vnd=contract.amount_vnd,
                status=contract.status,
                received_vnd=outcome.received_vnd,
                shortfall_vnd=outcome.shortfall_vnd,
                flags=sorted(outcome.flags),
                payment_instructions_issued_at=contract.payment_instructions_issued_at,
                due_at=due_at,
                overdue=_overdue(contract, due_at, now),
                created_at=contract.created_at,
            )
        )
    return out


@router.get("/contracts/{contract_id}", response_model=ContractDetail, summary="계약 상세 (입금건·대조·예상기간)")
async def get_contract(
    contract_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    contract = await _get_contract_or_404(db, contract_id)
    return await _contract_detail(db, contract)


# ── 미매칭 입금건 목록 ────────────────────────────────────────────────────


@router.get("/deposits", response_model=list[DepositRow], summary="미매칭 입금건 목록")
async def list_unmatched_deposits(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdDeposit).where(AdDeposit.contract_id.is_(None)).order_by(AdDeposit.created_at.desc())
    )
    return [DepositRow.model_validate(d) for d in result.scalars().all()]


# ── 입금건 등록 (어댑터 ① manual) ───────────────────────────────────────


@router.post(
    "/contracts/{contract_id}/deposits", response_model=ContractDetail, summary="입금건 등록 (계약건에 묶어서)"
)
async def create_contract_deposit(
    contract_id: uuid.UUID,
    body: DepositCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    contract = await _get_contract_or_404(db, contract_id)

    # [중 4] 종결 계약(cancelled/refunded)에는 입금건을 등록하지 않는다. match_deposit(:481) 와
    # 동일 가드 — 이쪽엔 빠져 있어 취소·환불 계약에도 입금이 붙는 구멍이 있었다.
    if contract.status in ("cancelled", "refunded"):
        raise HTTPException(status_code=409, detail={"error": "contract_closed"})

    if not body.force:
        dup = await _find_duplicate_suspect(db, contract.id, body.kind, body.amount_vnd, body.paid_at)
        if dup is not None:
            raise HTTPException(
                status_code=409,
                detail={"error": "duplicate_suspect", "existing_deposit_id": str(dup.id)},
            )

    obs = DepositObservation(
        kind=body.kind,
        amount_vnd=body.amount_vnd,
        paid_at=body.paid_at,
        memo_raw=body.memo_raw,
        payer_name=body.payer_name,
        bank_ref=body.bank_ref,
        source="manual",
        source_ref=None,
        payment_code_hint=contract.payment_code,
    )
    # ingest_deposit() 이 세션 트랜잭션을 소유(commit/rollback) — evidence/note 는 그 안에서
    # 입금 INSERT 와 한 commit 으로 함께 저장한다([중 2], 2차 commit 실패로 증빙 없는 돈 행이
    # 남는 것을 막는다). audit 은 반드시 이 호출 "후"에 스테이징한다.
    result = await ingest_deposit(
        db, obs, actor=session.username, evidence_content_id=body.evidence_content_id, note=body.note
    )

    detail = {
        "deposit_id": str(result.deposit_id),
        "contract_id": str(result.contract_id) if result.contract_id else None,
        "amount_vnd": body.amount_vnd,
        "paid_at": body.paid_at.isoformat(),
        "payer_name": body.payer_name,
        "bank_ref": body.bank_ref,
        "note": body.note,
        "matched_code": result.matched_code,
    }
    if body.force:
        detail["duplicate_override"] = True
    await audit(db, session, request, "BIZ_AD_DEPOSIT_RECORD", "ad_deposit", str(result.deposit_id), detail)
    await db.commit()

    refreshed = await _get_contract_or_404(db, contract_id)
    return await _contract_detail(db, refreshed)


@router.post("/deposits", summary="미매칭 입금건 등록 (코드 누락/오입금)")
async def create_unmatched_deposit(
    body: UnmatchedDepositCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    # code-review 지적: 이 엔드포인트만 중복탐지·force 를 거치지 않아 같은 미배정 오입금이
    # 재시도로 두 번 등록될 수 있었다(source_ref=None 이라 port.py 의 UNIQUE 멱등도 안 걸림).
    # create_contract_deposit 과 동일하게 처리한다.
    if not body.force:
        dup = await _find_duplicate_suspect(db, None, body.kind, body.amount_vnd, body.paid_at)
        if dup is not None:
            raise HTTPException(
                status_code=409,
                detail={"error": "duplicate_suspect", "existing_deposit_id": str(dup.id)},
            )

    obs = DepositObservation(
        kind=body.kind,
        amount_vnd=body.amount_vnd,
        paid_at=body.paid_at,
        memo_raw=body.memo_raw,
        payer_name=body.payer_name,
        bank_ref=body.bank_ref,
        source="manual",
        source_ref=None,
        payment_code_hint=body.payment_code_hint,
    )
    result = await ingest_deposit(db, obs, actor=session.username)

    if body.evidence_content_id is not None or body.note is not None:
        deposit = await db.get(AdDeposit, result.deposit_id)
        if deposit is not None:
            deposit.evidence_content_id = body.evidence_content_id
            deposit.note = body.note

    detail = {
        "deposit_id": str(result.deposit_id),
        "contract_id": str(result.contract_id) if result.contract_id else None,
        "amount_vnd": body.amount_vnd,
        "paid_at": body.paid_at.isoformat(),
        "payer_name": body.payer_name,
        "bank_ref": body.bank_ref,
        "note": body.note,
        "matched_code": result.matched_code,
    }
    if body.force:
        detail["duplicate_override"] = True
    await audit(db, session, request, "BIZ_AD_DEPOSIT_RECORD", "ad_deposit", str(result.deposit_id), detail)
    await db.commit()

    return {
        "deposit_id": result.deposit_id,
        "contract_id": result.contract_id,
        "matched": result.contract_id is not None,
    }


@router.post("/deposits/{deposit_id}/match", response_model=ContractDetail, summary="미매칭 입금건을 계약에 배정")
async def match_deposit(
    deposit_id: uuid.UUID,
    body: DepositMatchRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    deposit = await db.get(AdDeposit, deposit_id)
    if deposit is None:
        raise HTTPException(status_code=404, detail="deposit not found")
    contract = await _get_contract_or_404(db, body.contract_id)

    # [경미] 종결 계약(cancelled/refunded)에는 입금건을 배정하지 않는다.
    if contract.status in ("cancelled", "refunded"):
        raise HTTPException(status_code=409, detail={"error": "contract_closed"})

    before_contract_id = deposit.contract_id
    deposit.contract_id = contract.id
    await db.flush()

    ad = await _get_ad_or_404(db, contract.ad_id)
    outcome = await _reconcile(db, contract, partner_name=ad.partner_name)

    # D-B(§6): 초과 입금분 이월(재배정) 허용 여부 — ALLOW_OVERPAYMENT_CARRYOVER 가 False 면
    # 재배정으로 계약이 초과 상태가 되는 것을 막는다(하드코딩 금지, constants.py 실제 소비).
    if "overpaid" in outcome.flags and not payment_constants.ALLOW_OVERPAYMENT_CARRYOVER:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"error": "overpayment_carryover_disallowed"})

    payment_contracts.apply_reconcile_outcome(contract, outcome, reconcilable_statuses=_RECONCILABLE_STATUSES)

    # [치명 1] 재배정 시 이전 계약도 재대조 — 그렇지 않으면 이전 계약이 "입금 0원인데 paid" 로
    # 남아 승인이 가능해진다(§4-2 "재배정 시 두 계약 모두 재대조").
    if before_contract_id is not None and before_contract_id != contract.id:
        before_contract = await db.get(AdContract, before_contract_id)
        if before_contract is not None:
            before_ad = await _get_ad_or_404(db, before_contract.ad_id)
            before_outcome = await _reconcile(db, before_contract, partner_name=before_ad.partner_name)
            payment_contracts.apply_reconcile_outcome(
                before_contract, before_outcome, reconcilable_statuses=_RECONCILABLE_STATUSES
            )
            # [치명 2] before_contract 가 이미 active(승인 완료)면 apply_reconcile_outcome 은
            # _RECONCILABLE_STATUSES 밖이라 전이시키지 않는다 — 재배정으로 입금이 빠져나가
            # shortfall 이 생겨도 계약은 active 로 남고 광고는 계속 무료 노출된다. 이 계약이
            # ad.paid_until 의 근거(최신 계약)일 때만 expired 로 내린다(치명 1 과 동일 판정).
            if before_contract.status == "active" and before_outcome.shortfall_vnd > 0:
                before_is_latest = (
                    before_ad.paid_until is not None and before_contract.period_end == before_ad.paid_until
                )
                if before_is_latest:
                    before_ad.subscription_status = "expired"

    await audit(
        db,
        session,
        request,
        "BIZ_AD_DEPOSIT_MATCH",
        "ad_deposit",
        str(deposit_id),
        {
            "before_contract_id": str(before_contract_id) if before_contract_id else None,
            "after_contract_id": str(contract.id),
            "reason": body.reason,
        },
    )
    await db.commit()

    refreshed = await _get_contract_or_404(db, contract.id)
    return await _contract_detail(db, refreshed)


# ── 승인·취소·환불종결 ────────────────────────────────────────────────────


@router.post("/contracts/{contract_id}/approve", summary="승인 (paid/partially_paid → active)")
async def approve_contract(
    contract_id: uuid.UUID,
    body: ApproveRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    contract = await _get_contract_or_404(db, contract_id)
    # approve() 는 ad.id != contract.ad_id 를 거부한다 — ad 는 반드시 contract.ad_id 로 조회한다.
    ad = await _get_ad_or_404(db, contract.ad_id)

    outcome = await _reconcile(db, contract, partner_name=ad.partner_name)

    # [치명 1] stale 가드 — 저장된 contract.status 가 방금 다시 계산한 대조 결과와 다르면(예: 재배정
    # 후 재대조가 누락된 경우) 승인을 막는다. 재대조 후 다시 시도하게 한다.
    if contract.status in ("paid", "partially_paid") and outcome.status != contract.status:
        raise HTTPException(
            status_code=409,
            detail={"error": "stale_reconcile", "message": "입금 재대조가 필요합니다 (상태가 최신이 아님)"},
        )

    deposits = await _deposits_for_contract(db, contract.id)
    deposit_ids = [d.id for d in deposits if d.contract_id == contract.id]
    prev_paid_until = ad.paid_until
    now = datetime.now(UTC)

    try:
        # ad 로우 락 안에서 paid_until read-modify-write (동시 승인 경쟁 방지) — 프로덕션 승인
        # 경로는 순수 approve() 대신 반드시 이 래퍼를 쓴다(contracts.py 참조).
        period_start, period_end = await payment_contracts.approve_with_ad_lock(
            db, contract, ad, actor=session.username, now=now, reason=body.reason
        )
    except ContractStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    detail: dict = {
        "contract_id": str(contract.id),
        "ad_id": str(ad.id),
        "months": contract.months,
        "amount_vnd": contract.amount_vnd,
        "received_vnd": outcome.received_vnd,
        "deposit_ids": [str(d) for d in deposit_ids],
        "prev_paid_until": prev_paid_until.isoformat() if prev_paid_until else None,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }
    if outcome.shortfall_vnd > 0:
        detail["shortfall_vnd"] = outcome.shortfall_vnd
    if body.reason:
        detail["reason"] = body.reason

    await audit(db, session, request, "BIZ_AD_CONTRACT_APPROVE", "ad_contract", str(contract.id), detail)
    await db.commit()

    owner_bp = await db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
    if owner_bp is not None:
        await noti_events.publish(
            "biz.ad_reviewed",
            {
                "user_id": str(owner_bp.user_id),
                "ad_id": str(ad.id),
                "ad_title": ad.title,
                "result": "SUBSCRIPTION_ACTIVE",
            },
        )

    return {
        "id": contract.id,
        "status": contract.status,
        "ad_id": ad.id,
        "ad_paid_until": ad.paid_until,
        "ad_subscription_status": ad.subscription_status,
    }


@router.post("/contracts/{contract_id}/cancel", summary="취소")
async def cancel_contract(
    contract_id: uuid.UUID,
    body: ReasonRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    contract = await _get_contract_or_404(db, contract_id)
    deposits = await _deposits_for_contract(db, contract.id)
    now = datetime.now(UTC)

    try:
        payment_contracts.cancel(contract, reason=body.reason, deposits=deposits, now=now)
    except ContractStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await audit(
        db, session, request, "BIZ_AD_CONTRACT_CANCEL", "ad_contract", str(contract.id), {"reason": body.reason}
    )
    await db.commit()
    return {"id": contract.id, "status": contract.status}


@router.post("/contracts/{contract_id}/close-refunded", summary="환불 종결 (active → refunded)")
async def close_refunded_contract(
    contract_id: uuid.UUID,
    body: ReasonRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    contract = await _get_contract_or_404(db, contract_id)
    ad = await _get_ad_or_404(db, contract.ad_id)
    deposits = await _deposits_for_contract(db, contract.id)
    now = datetime.now(UTC)

    try:
        payment_contracts.close_refunded(contract, reason=body.reason, deposits=deposits, now=now)
    except ContractStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # D-C(§6): 최신이 아닌 active 계약의 환불 시 paid_until 자동 조정 여부 — AUTO_ADJUST_NON_LATEST_REFUND
    # 를 실제로 읽는다(하드코딩 금지). 이 계약이 ad.paid_until 의 근거(최신 계약)일 때만 자동 되돌림.
    detail: dict = {"reason": body.reason}
    is_latest = ad.paid_until is not None and contract.period_end == ad.paid_until
    if is_latest:
        prev_paid_until = ad.paid_until
        ad.paid_until = contract.period_start
        # [치명 1] 최신 계약이 환불 종결되면 ad.subscription_status 도 함께 expired 로 내린다 —
        # paid_until 만 되돌리면 갱신 유예기간(is_payment_ok)에 걸려 무료 노출이 이어진다.
        # expired 는 불변식(active⇒paid_until NOT NULL) 대상이 아니므로 paid_until 은 그대로 둔다.
        ad.subscription_status = "expired"
        detail["ad_paid_until_adjusted"] = True
        detail["prev_paid_until"] = prev_paid_until.isoformat() if prev_paid_until else None
        detail["new_paid_until"] = contract.period_start.isoformat() if contract.period_start else None
    else:
        # 설계상 기본값 False = 관리자 수동 조정(§4-2 D-C). True 로 바뀌면 여기서 실제 조정 로직이
        # 필요하지만, 지금은 상수가 False 고정이라 그 분기는 아직 구현하지 않는다(P1-4 범위).
        detail["ad_paid_until_adjusted"] = False

    await audit(db, session, request, "BIZ_AD_CONTRACT_REFUND_CLOSE", "ad_contract", str(contract.id), detail)
    await db.commit()
    return {"id": contract.id, "status": contract.status, "ad_paid_until": ad.paid_until}


# ── 카드 결제 레일 (토스) 재동기화·환불 (260907_toss_payment_rail_design.md §8 P2-6) ────────


@router.post(
    "/contracts/{contract_id}/rail-sync",
    response_model=ContractDetail,
    summary="토스 결제 재동기화 (유실된 웹훅/confirm 복구)",
)
async def rail_sync_contract(
    contract_id: uuid.UUID,
    body: RailSyncRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """토스에는 결제됐는데 웹훅·confirm 유실로 원장에 안 잡힌 결제를 `ref`(paymentKey) 로 재조회해
    복구한다. `TossCardRail.lookup()` 만 호출 — 직접 HTTP 를 부르지 않는다(design §8 P2-6)."""
    contract = await _get_contract_or_404(db, contract_id)
    ad = await _get_ad_or_404(db, contract.ad_id)

    rail = RAILS["toss_card"]
    try:
        result = await rail.lookup(contract, ref=body.ref)
    except RailValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except RailNotSupported as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except TossApiError as exc:
        raise HTTPException(status_code=502, detail={"error": "toss_lookup_failed", "message": exc.message}) from None
    if result is None:
        raise HTTPException(status_code=404, detail={"error": "payment_not_found"})

    now = datetime.now(UTC)
    outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=now)
    await checkout_core.record_auto_approve_audit(db, outcome)

    await audit(
        db,
        session,
        request,
        "BIZ_AD_CONTRACT_RAIL_SYNC",
        "ad_contract",
        str(contract.id),
        {
            "ref": body.ref,
            "ingest_duplicate": outcome.ingest_duplicate,
            "ingest_status": outcome.ingest_status,
            "approved": outcome.approved,
        },
    )
    await db.commit()

    refreshed = await _get_contract_or_404(db, contract_id)
    return await _contract_detail(db, refreshed)


@router.post(
    "/contracts/{contract_id}/rail-refund",
    response_model=ContractDetail,
    summary="카드 결제 부분/전액 환불 (토스 취소)",
)
async def rail_refund_contract(
    contract_id: uuid.UUID,
    body: RailRefundRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """`TossCardRail.refund()` 로 토스 취소 API 를 태우고, 성공하면 `ad_deposits` 에 `kind='refund'`
    행을 만든다. 대상 입금건이 토스 결제(source='toss')가 아니면(계좌이체 계약) 409(design §8 P2-6)."""
    contract = await _get_contract_or_404(db, contract_id)

    deposit = await db.get(AdDeposit, body.deposit_id)
    if deposit is None or deposit.contract_id != contract.id:
        raise HTTPException(status_code=404, detail={"error": "deposit_not_found"})
    if deposit.source != "toss" or deposit.kind != "deposit" or not deposit.source_ref:
        raise HTTPException(status_code=409, detail={"error": "not_card_deposit"})

    # `refund()` 는 `{deposit.source_ref}:cancel:<transactionKey|idempotency_seed>` 형식으로
    # refund_ref 를 만든다(toss_card.py) — 이 접두사로 이 입금건에 대한 기존 환불 행을 찾는다.
    prior_refunds = (
        (
            await db.execute(
                select(AdDeposit).where(
                    AdDeposit.contract_id == contract.id,
                    AdDeposit.kind == "refund",
                    AdDeposit.source_ref.like(f"{deposit.source_ref}:cancel:%"),
                )
            )
        )
        .scalars()
        .all()
    )
    refunded_so_far = sum(d.amount_vnd for d in prior_refunds)
    refundable_vnd = deposit.amount_vnd - refunded_so_far
    if refundable_vnd <= 0:
        raise HTTPException(status_code=422, detail={"error": "deposit_already_refunded"})
    if body.amount_vnd is not None and body.amount_vnd > refundable_vnd:
        raise HTTPException(status_code=422, detail={"error": "amount_exceeds_deposit"})

    # 같은 요청의 재시도(더블클릭 등)는 같은 (입금건, 요청금액, 기존환불횟수) 조합이라 같은 seed →
    # 토스 Idempotency-Key 재사용으로 중복 차단. 별개의 새 부분환불은 금액이 다르거나 이 시점의
    # prior_refunds 개수가 달라져(직전 환불이 이미 반영된 뒤라) 자연히 다른 seed 가 된다.
    idempotency_seed = f"{deposit.id}:{body.amount_vnd if body.amount_vnd is not None else 'full'}:{len(prior_refunds)}"

    rail = RAILS["toss_card"]
    try:
        result = await rail.refund(
            contract,
            ref=deposit.source_ref,
            amount_vnd=body.amount_vnd,
            reason=body.reason,
            idempotency_seed=idempotency_seed,
            remaining_amount_vnd=refundable_vnd if body.amount_vnd is None else None,
        )
    except RailValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except RailNotSupported as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except httpx.TransportError:
        # 취소 POST의 결과가 모호하므로 자동 재호출하지 않는다. 같은 멱등키로 운영자가 안전하게
        # 재시도할 수 있도록 retryable 503만 반환한다.
        raise HTTPException(status_code=503, detail={"error": "toss_cancel_unavailable", "retryable": True}) from None
    except TossApiError as exc:
        raise HTTPException(status_code=502, detail={"error": "toss_cancel_failed", "message": exc.message}) from None

    ingest_result = await ingest_deposit(db, result.observation, actor=f"rail:refund:{session.username}")
    if not ingest_result.duplicate:
        refund_deposit = await db.get(AdDeposit, ingest_result.deposit_id)
        if refund_deposit is not None:
            refund_deposit.charge_snapshot = result.charge_snapshot

    await audit(
        db,
        session,
        request,
        "BIZ_AD_CONTRACT_RAIL_REFUND",
        "ad_contract",
        str(contract.id),
        {
            "source_deposit_id": str(deposit.id),
            "refund_deposit_id": str(ingest_result.deposit_id),
            "amount_vnd": body.amount_vnd if body.amount_vnd is not None else refundable_vnd,
            "reason": body.reason,
            "duplicate": ingest_result.duplicate,
        },
    )
    await db.commit()

    refreshed = await _get_contract_or_404(db, contract_id)
    return await _contract_detail(db, refreshed)


# ── 배선 상태 ─────────────────────────────────────────────────────────────


@router.get("/payment-wiring", summary="계좌·카드(토스) 배선 상태 (값 없음, 키 이름만)")
async def get_payment_wiring(_session: AdminSession = Depends(verify_admin_api)):
    missing_keys = [key for key in _BANK_ENV_KEYS if not os.getenv(key, "").strip()]
    # stub 모드(§5-1)는 client/secret 키가 애초에 불필요하다 — ready:true 인데 missing_keys 에
    # 그 두 키가 뜨는 자기모순을 피하려고 live 모드일 때만 검사한다.
    toss_missing_keys = (
        [key for key in payment_config.TOSS_ENV_KEYS[:2] if not os.getenv(key, "").strip()]
        if payment_config.toss_mode() != "stub"
        else []
    )
    return {
        "ready": payment_config.bank_wiring_ready(),
        "missing_keys": missing_keys,
        "toss": {"ready": payment_config.toss_wiring_ready(), "missing_keys": toss_missing_keys},
    }
