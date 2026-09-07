"""seam-B: 입금 관측 포트 (260907_ad_payment_pipeline_design.md §2-1).

어댑터가 무엇이든(manual/csv/bank_feed) `DepositObservation` 하나를 만들어 `ingest_deposit()`
하나만 호출한다. 코어는 코드로 계약을 특정하고, 멱등 삽입하고, 대조까지 마친다. 승인은 하지 않는다
(승인은 contracts.approve, 관리자 액션).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import AdContract, AdDeposit
from . import payment_code
from .reconcile import reconcile_contract

# ingest_deposit 이 대조 결과로 계약 상태를 갱신하는 범위 — 이 밖의 상태(draft/active/
# cancelled/refunded)는 입금건이 매칭돼도 건드리지 않는다(§4-1 상태기계). accepted 포함(감독
# 결정): 관리자의 수동 입금 등록은 계좌 미배선 여부와 무관하게 "돈이 실제로 들어왔음"을 뜻하므로
# 대조를 막을 이유가 없다(§2-3 은 입금 안내 발급 시점 규정이지 대조 차단 규정이 아니다, §7).
_RECONCILABLE_STATUSES = ("accepted", "awaiting_payment", "partially_paid", "paid")


@dataclass(frozen=True)
class DepositObservation:
    amount_vnd: int
    paid_at: datetime
    memo_raw: str | None
    payer_name: str | None
    bank_ref: str | None
    source: Literal["manual", "csv", "bank_feed", "toss"]
    source_ref: str | None
    kind: Literal["deposit", "refund"] = "deposit"
    payment_code_hint: str | None = None


@dataclass(frozen=True)
class IngestResult:
    deposit_id: uuid.UUID
    contract_id: uuid.UUID | None
    duplicate: bool
    status: str | None
    matched_code: str | None


async def _find_by_source_ref(db: AsyncSession, source: str, source_ref: str) -> AdDeposit | None:
    result = await db.execute(select(AdDeposit).where(AdDeposit.source == source, AdDeposit.source_ref == source_ref))
    return result.scalar_one_or_none()


async def _result_from_existing(db: AsyncSession, existing: AdDeposit) -> IngestResult:
    contract = await db.get(AdContract, existing.contract_id) if existing.contract_id else None
    return IngestResult(
        deposit_id=existing.id,
        contract_id=existing.contract_id,
        duplicate=True,
        status=contract.status if contract else None,
        matched_code=contract.payment_code if contract else None,
    )


async def ingest_deposit(db: AsyncSession, obs: DepositObservation, *, actor: str) -> IngestResult:
    """코어. 어댑터가 무엇이든 이 함수 하나만 호출한다 (§2-1).

    1) code = payment_code_hint or extract_code(memo_raw) → ad_contracts 특정 (없으면 NULL 보관)
    2) UNIQUE(source, source_ref) 로 멱등 삽입 (중복이면 기존 행 반환, 상태 변경 없음)
    3) reconcile(contract) → status 갱신 (awaiting_payment|partially_paid|paid)
    """
    if obs.source_ref is not None:
        existing = await _find_by_source_ref(db, obs.source, obs.source_ref)
        if existing is not None:
            return await _result_from_existing(db, existing)

    code = payment_code.parse_and_validate(obs.payment_code_hint) if obs.payment_code_hint else None
    if code is None and obs.memo_raw:
        candidates = payment_code.extract_codes(obs.memo_raw)
        code = candidates[0] if len(candidates) == 1 else None

    contract: AdContract | None = None
    if code is not None:
        # 같은 계약에 대한 동시 입금을 직렬화한다 — 계약 로우를 잠근 뒤 입금 INSERT → 재대조 →
        # 상태 갱신까지 이 락 안에서 끝낸다(락 없이는 READ COMMITTED 하에서 두 입금이 서로의
        # 미커밋 INSERT 를 못 봐 상태가 paid → partially_paid 로 역행할 수 있다).
        # populate_existing: 호출부가 미리 읽어둔 인스턴스라도 락 획득 시점의 최신 status 로 다시
        # 채운다 — 스테일 status 로 대조를 건너뛰지 않게.
        result = await db.execute(
            select(AdContract)
            .where(AdContract.payment_code == code)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        contract = result.scalar_one_or_none()

    deposit = AdDeposit(
        contract_id=contract.id if contract else None,
        kind=obs.kind,
        amount_vnd=obs.amount_vnd,
        paid_at=obs.paid_at,
        payer_name=obs.payer_name,
        memo_raw=obs.memo_raw,
        bank_ref=obs.bank_ref,
        source=obs.source,
        source_ref=obs.source_ref,
        recorded_by=actor,
    )
    db.add(deposit)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        if obs.source_ref is None:
            raise
        existing = await _find_by_source_ref(db, obs.source, obs.source_ref)
        if existing is None:
            raise
        return await _result_from_existing(db, existing)

    new_status = None
    if contract is not None and contract.status in _RECONCILABLE_STATUSES:
        rows = (await db.execute(select(AdDeposit).where(AdDeposit.contract_id == contract.id))).scalars().all()
        outcome = reconcile_contract(expected_vnd=contract.amount_vnd, deposits=rows)
        contract.status = outcome.status
        new_status = outcome.status

    await db.commit()
    return IngestResult(
        deposit_id=deposit.id,
        contract_id=contract.id if contract else None,
        duplicate=False,
        status=new_status,
        matched_code=contract.payment_code if contract else None,
    )
