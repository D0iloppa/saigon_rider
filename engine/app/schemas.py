from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.enums import (
    AbuseSeverityEnum, AbuseActionEnum, AccountTypeEnum,
    AcquisitionSourceEnum, CollectionStatusEnum,
    EventStatusEnum, ExpireStatusEnum, GachaStatusEnum,
    ItemEffectEnum, ItemRarityEnum, ItemSlotEnum,
    MissionStatusEnum, QuestCardStatusEnum, QuestCardTypeEnum,
    RedemptionStatusEnum, SeasonStatusEnum,
    TxTypeEnum, UserStatusEnum,
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
    xp_awarded: int
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
    calculated_xp: float
    applied_multiplier: float
    process_status: EventStatusEnum
    reject_reason_code: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 잔액 / 거래 ──────────────────────────────────────────────


class WalletRead(BaseModel):
    user_uuid: str
    gp_balance: int
    gc_balance: int

    model_config = {"from_attributes": True}


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
    reward_xp: int
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
    required_xp: int
    face_value_vnd: Optional[int] = None
    monthly_quota: Optional[int] = None
    monthly_issued: int
    is_active: bool
    visible_from: Optional[datetime] = None
    visible_until: Optional[datetime] = None
    thumbnail_asset_uri: Optional[str] = None

    model_config = {"from_attributes": True}


class RedemptionCreate(BaseModel):
    catalog_id: int
    idempotency_key: str = Field(max_length=80)


class RedemptionRead(BaseModel):
    redemption_id: int
    user_id: int
    catalog: CatalogItemRead
    xp_transaction_id: Optional[int] = None
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
    min_lifetime_xp: int
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


# ── sre_message ──────────────────────────────────────────────


class SreMessageRead(BaseModel):
    id: int
    type: str
    uuid: str
    message: str
    timestamp: datetime
    extra: Optional[dict[str, Any]] = Field(None, alias="_extra")

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── 게이미피케이션 v2 — 아이템/컬렉션 ──────────────────────────


class ItemCollectionRead(BaseModel):
    collection_code: str
    display_name: str
    theme_color_hex: Optional[str] = None
    status: CollectionStatusEnum
    sort_order: Optional[int] = None

    model_config = {"from_attributes": True}


class ItemDefinitionRead(BaseModel):
    item_code: str
    display_name: str
    slot: ItemSlotEnum
    rarity: ItemRarityEnum
    collection_code: str
    shop_price_gp: Optional[int] = None
    shop_price_gc: Optional[int] = None
    is_shop_visible: bool
    season_lock: bool
    required_season_code: Optional[str] = None
    asset_uri: Optional[str] = None
    is_owned: bool = False
    effect_type: Optional[ItemEffectEnum] = None
    effect_value: Optional[int] = None

    model_config = {"from_attributes": True}


class UserItemRead(BaseModel):
    user_item_id: int
    item_code: str
    acquired_at: datetime
    acquisition_source: AcquisitionSourceEnum
    source_ref_id: Optional[int] = None
    item: Optional[ItemDefinitionRead] = Field(None, alias="item_def")

    model_config = {"from_attributes": True, "populate_by_name": True}


class UserEquipmentRead(BaseModel):
    slot: ItemSlotEnum
    item_code: Optional[str] = None
    equipped_at: datetime
    item: Optional[ItemDefinitionRead] = Field(None, alias="item_def")

    model_config = {"from_attributes": True, "populate_by_name": True}


class EquipRequest(BaseModel):
    item_code: str = Field(max_length=60)


class UnequipRequest(BaseModel):
    slot: str = Field(max_length=40)


class CollectionProgressRead(BaseModel):
    collection_code: str
    display_name: str
    theme_color_hex: Optional[str] = None
    total_items: int
    owned_items: int
    progress_pct: float


# ── 게이미피케이션 v2 — 시즌 ────────────────────────────────────


class SeasonRead(BaseModel):
    season_code: str
    display_name: str
    collection_code: str
    starts_at: datetime
    ends_at: datetime
    status: SeasonStatusEnum
    max_level: int
    sxp_per_level: int
    daily_sxp_cap: int

    model_config = {"from_attributes": True}


class UserSeasonPassRead(BaseModel):
    season_code: str
    sxp_balance: int
    current_level: int
    has_premium: bool
    premium_granted_at: Optional[datetime] = None
    claimed_levels: list[int] = []
    daily_sxp_today: int
    daily_sxp_date: Optional[Any] = None

    model_config = {"from_attributes": True}


# ── 게이미피케이션 v2 — 가챠 ────────────────────────────────────


class GachaDefinitionRead(BaseModel):
    gacha_code: str
    display_name: str
    description: Optional[str] = None
    cost_currency: str
    cost_per_pull: int
    cost_per_10_pull: int
    collection_filter: Optional[str] = None
    pity_threshold: Optional[int] = None
    pity_guarantee_rarity: Optional[ItemRarityEnum] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: GachaStatusEnum
    sort_order: Optional[int] = None

    model_config = {"from_attributes": True}


class GachaPullRequest(BaseModel):
    user_uuid: str
    gacha_code: str = Field(max_length=40)
    is_10_pull: bool = False
    skill_discount_pct: int = 0  # BFF가 전달하는 cost_discount 스킬 할인%


class GachaPullResultItem(BaseModel):
    pull_index: int
    rarity: str
    item_code: str
    was_pity_hit: bool = False
    was_guarantee: bool = False
    grant_status: str
    refund_currency: Optional[str] = None
    refund_amount: Optional[int] = None


class GachaPullResult(BaseModel):
    gacha_code: str
    is_10_pull: bool
    batch_id: int
    cost_currency: str
    cost_amount: int
    results: list[GachaPullResultItem]
    pity_count_after: int
    total_pulls_after: int


class GachaPityRead(BaseModel):
    gacha_code: str
    pity_count: int
    total_pulls: int
    last_pull_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SeasonLevelRead(BaseModel):
    season_code: str
    level: int
    sxp_threshold: int  # total SXP needed to reach this level
    is_locked: bool
    is_claimed: bool


class ClaimSeasonRewardRequest(BaseModel):
    level: int = Field(ge=1)
    track: str = Field(pattern=r"^(FREE|PREMIUM)$")


class ClaimSeasonRewardResult(BaseModel):
    ok: bool
    season_code: str
    level: int
    track: str
    claimed_levels: list[int]


class GachaPullLogRead(BaseModel):
    pull_log_id: int
    gacha_code: str
    batch_id: int
    is_10_pull: bool
    pull_index: int
    cost_currency: Optional[str] = None
    cost_amount: int
    picked_rarity: ItemRarityEnum
    picked_item_code: Optional[str] = None
    was_duplicate: bool
    refund_currency: Optional[str] = None
    refund_amount: Optional[int] = None
    was_pity_hit: bool
    was_10pull_guarantee: bool
    pulled_at: datetime

    model_config = {"from_attributes": True}


class GachaEligibility(BaseModel):
    gacha_code: str
    can_pull_single: bool
    can_pull_10: bool
    gp_balance: int
    gc_balance: int
    cost_single: int
    cost_10: int
    cost_currency: str


# ── 게이미피케이션 v2 — 상점 ────────────────────────────────────


class ShopItemRead(BaseModel):
    item_code: str
    display_name: str
    slot: ItemSlotEnum
    rarity: ItemRarityEnum
    collection_code: str
    shop_price_gp: Optional[int] = None
    shop_price_gc: Optional[int] = None
    is_featured: bool = False
    discount_pct: int = 0

    model_config = {"from_attributes": True}


class ShopPurchaseRequest(BaseModel):
    user_uuid: str
    item_code: str = Field(max_length=60)
    currency: str = Field(pattern=r"^(GP|GC)$")
    skill_discount_pct: int = 0  # BFF가 전달하는 cost_discount 스킬 할인%


class ShopPurchaseResult(BaseModel):
    item_code: str
    cost_currency: str
    base_price: int
    discount_pct: int
    cost_amount: int
    was_featured: bool
    user_item_id: int
    spend_tx_id: int
    purchase_log_id: int


class DailyFeaturedItemRead(BaseModel):
    featured_date: Any
    item_code: str
    discount_pct: int
    sort_order: int
    item: Optional[ItemDefinitionRead] = Field(None, alias="item_def")

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Quest Card ────────────────────────────────────────────

class QuestCardCreate(BaseModel):
    user_uuid: str
    external_quest_id: str
    user_quest_id: str
    card_type: QuestCardTypeEnum
    criteria: dict
    expires_at: Optional[datetime] = None


class QuestCardRead(BaseModel):
    card_id: int
    user_id: int
    external_quest_id: str
    user_quest_id: str
    card_type: QuestCardTypeEnum
    criteria: dict
    progress: dict = {}
    current_distance_m: int = 0
    status: QuestCardStatusEnum
    accepted_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    last_lat: Optional[float] = None
    last_lng: Optional[float] = None
    last_speed_kmh: Optional[float] = None
    distance_to_target_m: Optional[int] = None

    model_config = {"from_attributes": True}


class DailySlotInfo(BaseModel):
    max_slots: int
    used_slots: int
    remaining: int
    base: int
    level_bonus: int
    item_bonus: int


class EquipEffectsRead(BaseModel):
    rp_mult_pct: int
    gold_mult_pct: int
    quest_slot_bonus: int
    cost_discount_pct: int
