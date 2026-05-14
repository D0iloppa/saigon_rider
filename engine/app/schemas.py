from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.enums import (
    AbuseSeverityEnum, AbuseActionEnum, AccountTypeEnum,
    EventStatusEnum, ExpireStatusEnum, IntegrationTypeEnum,
    MissionStatusEnum, RedemptionStatusEnum, TxTypeEnum, UserStatusEnum,
)


# ── 공통 ────────────────────────────────────────────────────


class Page(BaseModel):
    next_cursor: Optional[str] = None
    has_more: bool = False


# ── 이벤트 ──────────────────────────────────────────────────


class EventCreate(BaseModel):
    user_id: str  # BFF user UUID (external_user_uuid in sre_user)
    action_code: str = Field(max_length=40)
    occurred_at: datetime
    payload: Optional[dict[str, Any]] = None
    idempotency_key: str = Field(max_length=80)


class EventResult(BaseModel):
    event_id: Optional[int]
    process_status: EventStatusEnum
    rp_awarded: int
    applied_multiplier: float
    diversity_multiplier: float
    transaction_id: Optional[int] = None
    reject_reason_code: Optional[str] = None


class EventRead(BaseModel):
    event_id: int
    user_id: int
    action_code: str
    occurred_at: datetime
    payload: Optional[dict[str, Any]] = None
    idempotency_key: str
    calculated_rp: float
    applied_multiplier: float
    process_status: EventStatusEnum
    reject_reason_code: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 잔액 / 거래 ──────────────────────────────────────────────


class BalanceRead(BaseModel):
    user_id: int
    current_balance: int
    lifetime_earned: int
    lifetime_spent: int
    expiring_in_30d: int = 0
    tier: Optional[str] = None
    last_recalculated_at: datetime

    model_config = {"from_attributes": True}


class TransactionRead(BaseModel):
    transaction_id: int
    user_id: int
    tx_type: TxTypeEnum
    amount: int
    balance_after: int
    source_type: str
    source_id: Optional[int] = None
    related_event_id: Optional[int] = None
    occurred_at: datetime
    expires_at: Optional[datetime] = None
    memo: Optional[str] = None

    model_config = {"from_attributes": True}


class ExpirationItemRead(BaseModel):
    expire_id: int
    source_transaction_id: int
    remaining_amount: int
    expires_at: datetime
    status: ExpireStatusEnum

    model_config = {"from_attributes": True}


# ── 미션 ────────────────────────────────────────────────────


class MissionDefinitionRead(BaseModel):
    mission_id: int
    mission_code: str
    title: str
    description: Optional[str] = None
    category_code: str
    target_rule: dict[str, Any]
    reward_rp: int
    duration_hours: Optional[int] = None
    is_repeatable: bool
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool

    model_config = {"from_attributes": True}


class MissionProgressRead(BaseModel):
    progress_id: int
    mission: MissionDefinitionRead
    current_value: int
    target_value: int
    status: MissionStatusEnum
    started_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── 보상 카탈로그 / 교환 ─────────────────────────────────────


class CatalogItemRead(BaseModel):
    catalog_id: int
    partner_id: int
    item_code: str
    item_name: str
    category_code: str
    required_rp: int
    face_value_vnd: Optional[int] = None
    monthly_quota: Optional[int] = None
    monthly_issued: int
    is_active: bool
    visible_from: Optional[datetime] = None
    visible_until: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RedemptionCreate(BaseModel):
    catalog_id: int
    idempotency_key: str = Field(max_length=80)


class RedemptionRead(BaseModel):
    redemption_id: int
    user_id: int
    catalog: CatalogItemRead
    rp_transaction_id: Optional[int] = None
    status: RedemptionStatusEnum
    voucher_code: Optional[str] = None
    requested_at: datetime
    fulfilled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── 등급 / 다양성 ────────────────────────────────────────────


class TierDefinitionRead(BaseModel):
    tier_code: str
    tier_name: str
    min_lifetime_rp: int
    min_diversity_count: int
    sort_order: int

    model_config = {"from_attributes": True}


class UserTierRead(BaseModel):
    user_id: int
    current_tier_code: str
    progress_to_next: int
    achieved_at: datetime

    model_config = {"from_attributes": True}


class DiversityScoreRead(BaseModel):
    user_id: int
    month_key: int
    active_category_count: int
    multiplier: float
    last_calculated_at: datetime

    model_config = {"from_attributes": True}


# ── 어드민 ───────────────────────────────────────────────────


class UserSummary(BaseModel):
    user_id: int
    external_user_uuid: str
    account_type: AccountTypeEnum
    is_driver_verified: bool
    status: UserStatusEnum
    created_at: datetime
    current_balance: int = 0
    current_tier_code: Optional[str] = None

    model_config = {"from_attributes": True}


class AbuseRuleRead(BaseModel):
    rule_code: str
    rule_name: str
    severity: AbuseSeverityEnum
    condition_json: dict[str, Any]
    action: AbuseActionEnum
    is_active: bool

    model_config = {"from_attributes": True}


class AuditEntryRead(BaseModel):
    audit_id: int
    entity_type: str
    entity_id: int
    actor_user_id: Optional[int] = None
    action_code: str
    before_snapshot: Optional[dict[str, Any]] = None
    after_snapshot: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 어드민 조정 ──────────────────────────────────────────────


class AdminAdjustCreate(BaseModel):
    amount: int = Field(gt=0)
    tx_type: TxTypeEnum = Field(description="ADJUST_PLUS or ADJUST_MINUS only")
    memo: Optional[str] = Field(None, max_length=200)
