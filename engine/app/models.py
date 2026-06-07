from sqlalchemy import (
    BigInteger, Boolean, Column, Date, Enum, ForeignKey,
    Identity, Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import relationship

from app.database import Base
from app.enums import (
    AbuseSeverityEnum, AbuseActionEnum, AccountTypeEnum,
    AcquisitionSourceEnum, BoxStatusEnum, CollectionStatusEnum,
    EventStatusEnum, ExpireStatusEnum, GachaStatusEnum,
    IntegrationTypeEnum, ItemEffectEnum, ItemRarityEnum, ItemSlotEnum,
    MissionStatusEnum, QuestCardStatusEnum, QuestCardTypeEnum,
    RedemptionStatusEnum, RewardActionTypeEnum,
    SeasonStatusEnum, TxTypeEnum, UserStatusEnum,
)

# ─────────────────────────────────────────────
# 공용 ENUM 컬럼 타입 (create_type=False → Alembic이 이미 생성)
# ─────────────────────────────────────────────
_TS = TIMESTAMP(timezone=True)


class SreUser(Base):
    __tablename__ = "sre_user"

    user_id = Column(BigInteger, Identity(always=True), primary_key=True)
    external_user_uuid = Column(String(64), nullable=False, unique=True)
    account_type = Column(
        Enum(AccountTypeEnum, name="account_type_enum", create_type=False),
        nullable=False, default=AccountTypeEnum.STANDARD, server_default="STANDARD",
    )
    is_driver_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    status = Column(
        Enum(UserStatusEnum, name="user_status_enum", create_type=False),
        nullable=False, default=UserStatusEnum.ACTIVE, server_default="ACTIVE",
    )
    total_distance_m = Column(BigInteger, nullable=False, default=0, server_default="0")
    total_exp_granted = Column(BigInteger, nullable=False, default=0, server_default="0")
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    balance = relationship("XpBalance", back_populates="user", uselist=False, lazy="select")
    tier = relationship("UserTier", back_populates="user", uselist=False, lazy="select")


class ActionDefinition(Base):
    __tablename__ = "action_definition"

    action_code = Column(String(40), primary_key=True)
    category_code = Column(String(20), nullable=False)
    display_name = Column(String(80), nullable=False)
    base_xp = Column(Integer, nullable=False, default=0, server_default="0")
    rp_grant = Column(Integer, nullable=False, default=0, server_default="0")  # SGR-213: 성취 보상 RP(gc) 적립액
    daily_count_limit = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    metadata_schema = Column(JSONB, nullable=True)
    updated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")


class ActionEvent(Base):
    __tablename__ = "action_event"

    event_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_event_user"), nullable=False)
    action_code = Column(String(40), ForeignKey("action_definition.action_code", name="fk_event_action"), nullable=False)
    occurred_at = Column(_TS, nullable=False)
    payload = Column(JSONB, nullable=True)
    idempotency_key = Column(String(80), nullable=False, unique=True)
    calculated_xp = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    applied_multiplier = Column(Numeric(4, 2), nullable=False, default=1.00, server_default="1.00")
    process_status = Column(
        Enum(EventStatusEnum, name="event_status_enum", create_type=False),
        nullable=False, default=EventStatusEnum.PENDING, server_default="PENDING",
    )
    reject_reason_code = Column(String(40), nullable=True)
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        Index("idx_event_user_occurred", "user_id", "occurred_at"),
        Index("idx_event_action_occurred", "action_code", "occurred_at"),
    )


class MissionDefinition(Base):
    __tablename__ = "mission_definition"

    mission_id = Column(BigInteger, Identity(always=True), primary_key=True)
    mission_code = Column(String(60), nullable=False, unique=True)
    title = Column(String(120), nullable=False)
    description = Column(String(500), nullable=True)
    category_code = Column(String(20), nullable=False)
    target_rule = Column(JSONB, nullable=False)
    reward_xp = Column(Integer, nullable=False)
    duration_hours = Column(Integer, nullable=True)
    is_repeatable = Column(Boolean, nullable=False, default=False, server_default="false")
    starts_at = Column(_TS, nullable=True)
    ends_at = Column(_TS, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    __table_args__ = (Index("idx_mission_def_category", "category_code"),)


class UserMissionProgress(Base):
    __tablename__ = "user_mission_progress"

    progress_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ump_user"), nullable=False)
    mission_id = Column(BigInteger, ForeignKey("mission_definition.mission_id", name="fk_ump_mission"), nullable=False)
    current_value = Column(Integer, nullable=False, default=0, server_default="0")
    target_value = Column(Integer, nullable=False)
    status = Column(
        Enum(MissionStatusEnum, name="mission_status_enum", create_type=False),
        nullable=False, default=MissionStatusEnum.ACTIVE, server_default="ACTIVE",
    )
    started_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    completed_at = Column(_TS, nullable=True)
    expires_at = Column(_TS, nullable=True)

    mission = relationship("MissionDefinition", lazy="select")

    __table_args__ = (
        Index("idx_ump_user_status", "user_id", "status"),
        Index("idx_ump_mission", "mission_id"),
    )


class MissionRecommendation(Base):
    __tablename__ = "mission_recommendation"

    rec_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_rec_user"), nullable=False)
    mission_id = Column(BigInteger, ForeignKey("mission_definition.mission_id", name="fk_rec_mission"), nullable=False)
    score = Column(Numeric(6, 3), nullable=False)
    reason_code = Column(String(40), nullable=False)
    recommended_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    consumed_at = Column(_TS, nullable=True)

    __table_args__ = (Index("idx_rec_user_recommended", "user_id", "recommended_at"),)


class XpBalance(Base):
    __tablename__ = "xp_balance"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_balance_user"), primary_key=True)
    current_balance = Column(BigInteger, nullable=False, default=0, server_default="0")
    gc_balance = Column(BigInteger, nullable=False, default=0, server_default="0")
    lifetime_earned = Column(BigInteger, nullable=False, default=0, server_default="0")
    lifetime_spent = Column(BigInteger, nullable=False, default=0, server_default="0")
    expiring_soon = Column(BigInteger, nullable=False, default=0, server_default="0")
    last_recalculated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    # RP(gc) 일일 적립 누적 — 일일 하드캡(DAILY_RP_CAP) 회로차단용. VN 일자 경계로 리셋.
    daily_gc_today = Column(Integer, nullable=False, default=0, server_default="0")
    daily_gc_date = Column(Date, nullable=True)

    user = relationship("SreUser", back_populates="balance")


class XpTransaction(Base):
    __tablename__ = "xp_transaction"

    transaction_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_tx_user"), nullable=False)
    tx_type = Column(
        Enum(TxTypeEnum, name="tx_type_enum", create_type=False),
        nullable=False,
    )
    amount = Column(BigInteger, nullable=False)
    balance_after = Column(BigInteger, nullable=False)
    source_type = Column(String(40), nullable=False)
    source_id = Column(BigInteger, nullable=True)
    related_event_id = Column(BigInteger, ForeignKey("action_event.event_id", name="fk_tx_event"), nullable=True)
    occurred_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    expires_at = Column(_TS, nullable=True)
    memo = Column(String(200), nullable=True)

    __table_args__ = (
        Index("idx_tx_user_occurred", "user_id", "occurred_at"),
        Index("idx_tx_user_type", "user_id", "tx_type"),
        Index("idx_tx_expires", "expires_at"),
    )


class XpExpirationSchedule(Base):
    __tablename__ = "xp_expiration_schedule"

    expire_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_exp_user"), nullable=False)
    source_transaction_id = Column(BigInteger, ForeignKey("xp_transaction.transaction_id", name="fk_exp_tx"), nullable=False)
    remaining_amount = Column(BigInteger, nullable=False)
    expires_at = Column(_TS, nullable=False)
    status = Column(
        Enum(ExpireStatusEnum, name="expire_status_enum", create_type=False),
        nullable=False, default=ExpireStatusEnum.PENDING, server_default="PENDING",
    )

    __table_args__ = (
        Index("idx_exp_user_expires", "user_id", "expires_at"),
        Index("idx_exp_status_expires", "status", "expires_at"),
    )


class BehaviorCategoryLog(Base):
    __tablename__ = "behavior_category_log"

    log_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_bcl_user"), nullable=False)
    category_code = Column(String(20), nullable=False)
    related_event_id = Column(BigInteger, nullable=True)
    occurred_at = Column(_TS, nullable=False)
    month_key = Column(Integer, nullable=False)

    __table_args__ = (
        Index("idx_bcl_user_month", "user_id", "month_key"),
        Index("idx_bcl_user_cat_month", "user_id", "category_code", "month_key"),
    )


class UserDiversityScore(Base):
    __tablename__ = "user_diversity_score"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_uds_user"), primary_key=True)
    month_key = Column(Integer, primary_key=True)
    active_category_count = Column(Integer, nullable=False, default=0, server_default="0")
    multiplier = Column(Numeric(4, 2), nullable=False, default=1.00, server_default="1.00")
    last_calculated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")


class TierDefinition(Base):
    __tablename__ = "tier_definition"

    tier_code = Column(String(20), primary_key=True)
    tier_name = Column(String(40), nullable=False)
    min_lifetime_xp = Column(BigInteger, nullable=False, default=0, server_default="0")
    min_diversity_count = Column(Integer, nullable=False, default=0, server_default="0")
    sort_order = Column(Integer, nullable=False)


class UserTier(Base):
    __tablename__ = "user_tier"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ut_user"), primary_key=True)
    current_tier_code = Column(String(20), ForeignKey("tier_definition.tier_code", name="fk_ut_tier"), nullable=False)
    progress_to_next = Column(BigInteger, nullable=False, default=0, server_default="0")
    achieved_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    user = relationship("SreUser", back_populates="tier")
    tier_def = relationship("TierDefinition", lazy="select")


class RewardPartner(Base):
    __tablename__ = "reward_partner"

    partner_id = Column(BigInteger, Identity(always=True), primary_key=True)
    partner_code = Column(String(40), nullable=False, unique=True)
    partner_name = Column(String(120), nullable=False)
    integration_type = Column(
        Enum(IntegrationTypeEnum, name="integration_type_enum", create_type=False),
        nullable=False,
    )
    api_config = Column(JSONB, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    catalogs = relationship("RewardCatalog", back_populates="partner", lazy="select")


class RewardCatalog(Base):
    __tablename__ = "reward_catalog"

    catalog_id = Column(BigInteger, Identity(always=True), primary_key=True)
    partner_id = Column(BigInteger, ForeignKey("reward_partner.partner_id", name="fk_cat_partner"), nullable=False)
    item_code = Column(String(60), nullable=False, unique=True)
    item_name = Column(String(120), nullable=False)
    category_code = Column(String(20), nullable=False)
    required_xp = Column(Integer, nullable=False)
    face_value_vnd = Column(Integer, nullable=True)
    monthly_quota = Column(Integer, nullable=True)
    monthly_issued = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    visible_from = Column(_TS, nullable=True)
    visible_until = Column(_TS, nullable=True)
    thumbnail_asset_uri = Column(String(255), nullable=True)  # SGR-213 P1: BFF가 imgproxy 변환

    partner = relationship("RewardPartner", back_populates="catalogs")

    __table_args__ = (Index("idx_cat_active_visible", "is_active", "visible_from", "visible_until"),)


class RewardRedemption(Base):
    __tablename__ = "reward_redemption"

    redemption_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_red_user"), nullable=False)
    catalog_id = Column(BigInteger, ForeignKey("reward_catalog.catalog_id", name="fk_red_catalog"), nullable=False)
    xp_transaction_id = Column(BigInteger, ForeignKey("xp_transaction.transaction_id", name="fk_red_tx"), nullable=True)
    status = Column(
        Enum(RedemptionStatusEnum, name="redemption_status_enum", create_type=False),
        nullable=False, default=RedemptionStatusEnum.REQUESTED, server_default="REQUESTED",
    )
    voucher_code = Column(String(120), nullable=True)
    external_response = Column(JSONB, nullable=True)
    idempotency_key = Column(String(80), nullable=False, unique=True)
    requested_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    fulfilled_at = Column(_TS, nullable=True)
    expires_at = Column(_TS, nullable=True)

    catalog = relationship("RewardCatalog", lazy="select")

    __table_args__ = (Index("idx_red_user_status", "user_id", "status"),)


class AbuseRule(Base):
    __tablename__ = "abuse_rule"

    rule_code = Column(String(40), primary_key=True)
    rule_name = Column(String(120), nullable=False)
    severity = Column(
        Enum(AbuseSeverityEnum, name="abuse_severity_enum", create_type=False),
        nullable=False, default=AbuseSeverityEnum.MEDIUM, server_default="MEDIUM",
    )
    condition_json = Column(JSONB, nullable=False)
    action = Column(
        Enum(AbuseActionEnum, name="abuse_action_enum", create_type=False),
        nullable=False,
    )
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")


class AbuseEvent(Base):
    __tablename__ = "abuse_event"

    abuse_event_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ae_user"), nullable=False)
    rule_code = Column(String(40), ForeignKey("abuse_rule.rule_code", name="fk_ae_rule"), nullable=False)
    related_event_id = Column(BigInteger, nullable=True)
    detail = Column(JSONB, nullable=True)
    action_taken = Column(
        Enum(AbuseActionEnum, name="abuse_action_enum", create_type=False),
        nullable=False,
    )
    detected_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (Index("idx_ae_user_detected", "user_id", "detected_at"),)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_key"

    idempotency_key = Column(String(80), primary_key=True)
    resource_type = Column(String(40), nullable=False)
    resource_id = Column(BigInteger, nullable=True)
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    expires_at = Column(_TS, nullable=False)

    __table_args__ = (Index("idx_idem_expires", "expires_at"),)


class SreMessage(Base):
    __tablename__ = "sre_message_tbl"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    type = Column(String(20), nullable=False, server_default="gps")
    uuid = Column(Text, nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(_TS, nullable=False, server_default="NOW()")
    _extra = Column("_extra", JSONB, nullable=False, server_default="{}")

    __table_args__ = (
        Index("idx_sre_msg_type_ts", "type", timestamp.desc()),
        Index("idx_sre_msg_uuid_ts", "uuid", timestamp.desc()),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    audit_id = Column(BigInteger, Identity(always=True), primary_key=True)
    entity_type = Column(String(40), nullable=False)
    entity_id = Column(BigInteger, nullable=False)
    actor_user_id = Column(BigInteger, nullable=True)
    action_code = Column(String(40), nullable=False)
    before_snapshot = Column(JSONB, nullable=True)
    after_snapshot = Column(JSONB, nullable=True)
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_created", "created_at"),
    )


# ─────────────────────────────────────────────
# 게이미피케이션 v2 — 아이템/시즌/박스/가챠/상점
# ─────────────────────────────────────────────


class ItemCollection(Base):
    __tablename__ = "item_collection"

    collection_code = Column(String(40), primary_key=True)
    display_name = Column(String(80), nullable=False)
    theme_color_hex = Column(String(7), nullable=True)
    status = Column(
        Enum(CollectionStatusEnum, name="collection_status_enum", create_type=False),
        nullable=False, default=CollectionStatusEnum.ACTIVE, server_default="ACTIVE",
    )
    sort_order = Column(Integer, nullable=True)
    created_at = Column(_TS, nullable=False, server_default="NOW()")

    items = relationship("ItemDefinition", back_populates="collection", lazy="select")


class ItemDefinition(Base):
    __tablename__ = "item_definition"

    item_code = Column(String(60), primary_key=True)
    display_name = Column(String(120), nullable=False)
    slot = Column(
        Enum(ItemSlotEnum, name="item_slot_enum", create_type=False),
        nullable=False,
    )
    rarity = Column(
        Enum(ItemRarityEnum, name="item_rarity_enum", create_type=False),
        nullable=False,
    )
    collection_code = Column(
        String(40), ForeignKey("item_collection.collection_code", name="fk_item_collection"),
        nullable=False,
    )
    shop_price_gp = Column(Integer, nullable=True)
    shop_price_gc = Column(Integer, nullable=True)
    is_shop_visible = Column(Boolean, nullable=False, default=True, server_default="true")
    season_lock = Column(Boolean, nullable=False, default=False, server_default="false")
    required_season_code = Column(String(40), nullable=True)
    asset_uri = Column(String(200), nullable=True)
    effect_type = Column(
        Enum(ItemEffectEnum, name="item_effect_enum", create_type=False),
        nullable=True,
    )
    created_at = Column(_TS, nullable=False, server_default="NOW()")

    collection = relationship("ItemCollection", back_populates="items", lazy="select")

    __table_args__ = (
        Index("idx_item_def_collection_rarity", "collection_code", "rarity"),
        Index("idx_item_def_slot", "slot"),
    )


class ItemEffectValue(Base):
    __tablename__ = "item_effect_value"

    effect_type = Column(
        Enum(ItemEffectEnum, name="item_effect_enum", create_type=False),
        primary_key=True,
    )
    rarity = Column(
        Enum(ItemRarityEnum, name="item_rarity_enum", create_type=False),
        primary_key=True,
    )
    stat_value = Column(Integer, nullable=False)


class UserItem(Base):
    __tablename__ = "user_item"

    user_item_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ui_user"), nullable=False)
    item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_ui_item"),
        nullable=False,
    )
    acquired_at = Column(_TS, nullable=False, server_default="NOW()")
    acquisition_source = Column(
        Enum(AcquisitionSourceEnum, name="acquisition_source_enum", create_type=False),
        nullable=False,
    )
    source_ref_id = Column(BigInteger, nullable=True)

    item_def = relationship("ItemDefinition", lazy="select")

    __table_args__ = (
        Index("idx_user_item_user", "user_id", acquired_at.desc()),
        Index("idx_user_item_source", "acquisition_source", "source_ref_id"),
    )


class UserEquipment(Base):
    __tablename__ = "user_equipment"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ue_user"), primary_key=True)
    slot = Column(
        Enum(ItemSlotEnum, name="item_slot_enum", create_type=False),
        primary_key=True,
    )
    item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_ue_item"),
        nullable=True,
    )
    equipped_at = Column(_TS, nullable=False, server_default="NOW()")

    item_def = relationship("ItemDefinition", lazy="select")


class Season(Base):
    __tablename__ = "season"

    season_code = Column(String(40), primary_key=True)
    display_name = Column(String(80), nullable=False)
    collection_code = Column(
        String(40), ForeignKey("item_collection.collection_code", name="fk_season_collection"),
        nullable=False,
    )
    starts_at = Column(_TS, nullable=False)
    ends_at = Column(_TS, nullable=False)
    status = Column(
        Enum(SeasonStatusEnum, name="season_status_enum", create_type=False),
        nullable=False, default=SeasonStatusEnum.UPCOMING, server_default="UPCOMING",
    )
    max_level = Column(Integer, nullable=False, default=30, server_default="30")
    sxp_per_level = Column(Integer, nullable=False, default=100, server_default="100")
    daily_sxp_cap = Column(Integer, nullable=False, default=500, server_default="500")
    created_at = Column(_TS, nullable=False, server_default="NOW()")

    collection = relationship("ItemCollection", lazy="select")

    __table_args__ = (
        Index("idx_season_status_period", "status", "starts_at", "ends_at"),
    )


class UserSeasonPass(Base):
    __tablename__ = "user_season_pass"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_usp_user"), primary_key=True)
    season_code = Column(
        String(40), ForeignKey("season.season_code", name="fk_usp_season"),
        primary_key=True,
    )
    sxp_balance = Column(Integer, nullable=False, default=0, server_default="0")
    current_level = Column(Integer, nullable=False, default=0, server_default="0")
    has_premium = Column(Boolean, nullable=False, default=False, server_default="false")
    premium_granted_at = Column(_TS, nullable=True)
    claimed_levels = Column(ARRAY(Integer), nullable=False, server_default="{}")
    daily_sxp_today = Column(Integer, nullable=False, default=0, server_default="0")
    daily_sxp_date = Column(Date, nullable=True)

    season = relationship("Season", lazy="select")


class LootboxDefinition(Base):
    __tablename__ = "lootbox_definition"

    box_code = Column(String(40), primary_key=True)
    display_name = Column(String(80), nullable=False)
    collection_filter = Column(
        String(40), ForeignKey("item_collection.collection_code", name="fk_loot_collection"),
        nullable=True,
    )
    drop_table = Column(JSONB, nullable=False)
    expires_with_season = Column(Boolean, nullable=False, default=False, server_default="false")
    required_season_code = Column(String(40), nullable=True)
    auto_open_on_grant = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(_TS, nullable=False, server_default="NOW()")


class UserInventoryBox(Base):
    __tablename__ = "user_inventory_box"

    inventory_box_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_uib_user"), nullable=False)
    box_code = Column(
        String(40), ForeignKey("lootbox_definition.box_code", name="fk_uib_box"),
        nullable=False,
    )
    granted_at = Column(_TS, nullable=False, server_default="NOW()")
    granted_source = Column(
        Enum(AcquisitionSourceEnum, name="acquisition_source_enum", create_type=False),
        nullable=False,
    )
    granted_source_ref = Column(BigInteger, nullable=True)
    opened_at = Column(_TS, nullable=True)
    status = Column(
        Enum(BoxStatusEnum, name="box_status_enum", create_type=False),
        nullable=False, default=BoxStatusEnum.UNOPENED, server_default="UNOPENED",
    )

    box_def = relationship("LootboxDefinition", lazy="select")

    __table_args__ = (
        Index("idx_user_box_user_status", "user_id", "status"),
    )


class LootboxDropLog(Base):
    __tablename__ = "lootbox_drop_log"

    drop_log_id = Column(BigInteger, Identity(always=True), primary_key=True)
    inventory_box_id = Column(
        BigInteger, ForeignKey("user_inventory_box.inventory_box_id", name="fk_ldl_box"),
        nullable=False,
    )
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ldl_user"), nullable=False)
    box_code = Column(
        String(40), ForeignKey("lootbox_definition.box_code", name="fk_ldl_boxdef"),
        nullable=False,
    )
    dropped_item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_ldl_item"),
        nullable=True,
    )
    was_duplicate = Column(Boolean, nullable=False, default=False, server_default="false")
    refund_currency = Column(String(4), nullable=True)
    refund_amount = Column(Integer, nullable=True)
    random_seed = Column(String(64), nullable=True)
    opened_at = Column(_TS, nullable=False, server_default="NOW()")

    __table_args__ = (
        Index("idx_drop_log_user", "user_id", opened_at.desc()),
        Index("idx_drop_log_box", "box_code", opened_at.desc()),
    )


class ItemAcquisitionLog(Base):
    __tablename__ = "item_acquisition_log"

    log_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ial_user"), nullable=False)
    item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_ial_item"),
        nullable=False,
    )
    acquisition_source = Column(
        Enum(AcquisitionSourceEnum, name="acquisition_source_enum", create_type=False),
        nullable=False,
    )
    source_ref_id = Column(BigInteger, nullable=True)
    granted_or_refunded = Column(String(10), nullable=False)
    refund_currency = Column(String(4), nullable=True)
    refund_amount = Column(Integer, nullable=True)
    occurred_at = Column(_TS, nullable=False, server_default="NOW()")

    __table_args__ = (
        Index("idx_item_acq_log_user", "user_id", occurred_at.desc()),
        Index("idx_item_acq_log_item", "item_code", occurred_at.desc()),
    )


class GachaDefinition(Base):
    __tablename__ = "gacha_definition"

    gacha_code = Column(String(40), primary_key=True)
    display_name = Column(String(80), nullable=False)
    description = Column(String(200), nullable=True)
    cost_currency = Column(String(4), nullable=False)
    cost_per_pull = Column(Integer, nullable=False)
    cost_per_10_pull = Column(Integer, nullable=False)
    collection_filter = Column(
        String(40), ForeignKey("item_collection.collection_code", name="fk_gacha_collection"),
        nullable=True,
    )
    drop_table = Column(JSONB, nullable=False)
    pity_threshold = Column(Integer, nullable=True)
    pity_guarantee_rarity = Column(
        Enum(ItemRarityEnum, name="item_rarity_enum", create_type=False),
        nullable=True,
    )
    pity_resets_with_season = Column(Boolean, nullable=False, default=False, server_default="false")
    starts_at = Column(_TS, nullable=True)
    ends_at = Column(_TS, nullable=True)
    required_season_code = Column(String(40), nullable=True)
    status = Column(
        Enum(GachaStatusEnum, name="gacha_status_enum", create_type=False),
        nullable=False, default=GachaStatusEnum.ACTIVE, server_default="ACTIVE",
    )
    is_listed = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=True)
    created_at = Column(_TS, nullable=False, server_default="NOW()")

    __table_args__ = (
        Index("idx_gacha_def_status_listed", "status", "is_listed"),
    )


class UserGachaPity(Base):
    __tablename__ = "user_gacha_pity"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_ugp_user"), primary_key=True)
    gacha_code = Column(
        String(40), ForeignKey("gacha_definition.gacha_code", name="fk_ugp_gacha"),
        primary_key=True,
    )
    pity_count = Column(Integer, nullable=False, default=0, server_default="0")
    total_pulls = Column(BigInteger, nullable=False, default=0, server_default="0")
    last_pull_at = Column(_TS, nullable=True)
    season_scope = Column(String(40), nullable=True)


class GachaPullLog(Base):
    __tablename__ = "gacha_pull_log"

    pull_log_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_gpl_user"), nullable=False)
    gacha_code = Column(
        String(40), ForeignKey("gacha_definition.gacha_code", name="fk_gpl_gacha"),
        nullable=False,
    )
    batch_id = Column(BigInteger, nullable=False)
    is_10_pull = Column(Boolean, nullable=False, default=False, server_default="false")
    pull_index = Column(Integer, nullable=False)
    cost_currency = Column(String(4), nullable=True)
    cost_amount = Column(Integer, nullable=False, default=0, server_default="0")
    picked_rarity = Column(
        Enum(ItemRarityEnum, name="item_rarity_enum", create_type=False),
        nullable=False,
    )
    picked_item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_gpl_item"),
        nullable=True,
    )
    was_duplicate = Column(Boolean, nullable=False, default=False, server_default="false")
    refund_currency = Column(String(4), nullable=True)
    refund_amount = Column(Integer, nullable=True)
    was_pity_hit = Column(Boolean, nullable=False, default=False, server_default="false")
    was_10pull_guarantee = Column(Boolean, nullable=False, default=False, server_default="false")
    pity_count_before = Column(Integer, nullable=True)
    pity_count_after = Column(Integer, nullable=True)
    random_seed = Column(String(64), nullable=True)
    pulled_at = Column(_TS, nullable=False, server_default="NOW()")

    __table_args__ = (
        Index("idx_gacha_log_user_time", "user_id", pulled_at.desc()),
        Index("idx_gacha_log_batch", "batch_id"),
        Index("idx_gacha_log_gacha_rarity", "gacha_code", "picked_rarity", pulled_at.desc()),
    )


class DailyFeaturedItem(Base):
    __tablename__ = "daily_featured_item"

    featured_date = Column(Date, primary_key=True)
    item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_dfi_item"),
        primary_key=True,
    )
    discount_pct = Column(Integer, nullable=False, default=30, server_default="30")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(_TS, nullable=False, server_default="NOW()")

    item_def = relationship("ItemDefinition", lazy="select")


class ShopPurchaseLog(Base):
    __tablename__ = "shop_purchase_log"

    purchase_log_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_spl_user"), nullable=False)
    item_code = Column(
        String(60), ForeignKey("item_definition.item_code", name="fk_spl_item"),
        nullable=False,
    )
    cost_currency = Column(String(4), nullable=False)
    base_price = Column(Integer, nullable=False)
    discount_pct = Column(Integer, nullable=False, default=0, server_default="0")
    cost_amount = Column(Integer, nullable=False)
    was_featured = Column(Boolean, nullable=False, default=False, server_default="false")
    user_item_id = Column(BigInteger, nullable=True)
    purchased_at = Column(_TS, nullable=False, server_default="NOW()")

    item_def = relationship("ItemDefinition", lazy="select")

    __table_args__ = (
        Index("idx_shop_log_user", "user_id", purchased_at.desc()),
        Index("idx_shop_log_item", "item_code", purchased_at.desc()),
    )


# ─────────────────────────────────────────────
# 단말-유저 매핑 & 마일리지 & 보상 정책 엔진
# ─────────────────────────────────────────────


class DeviceUserMap(Base):
    __tablename__ = "device_user_map"

    device_uuid = Column(String(128), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id"), nullable=False)
    fcm_token = Column(Text, nullable=True)
    logged_in_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_device_user_map_user_id"),
    )


class UserMileageLog(Base):
    __tablename__ = "user_mileage_log"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id"), nullable=False)
    distance_m = Column(Numeric(12, 2), nullable=False)
    device_uuid = Column(Text, nullable=True)
    recorded_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        Index("idx_mileage_log_user_ts", "user_id", recorded_at.desc()),
    )


class RewardPolicy(Base):
    __tablename__ = "reward_policy"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    policy_code = Column(String(60), nullable=False, unique=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    conditions = Column(JSONB, nullable=False, server_default="[]")
    is_repeatable = Column(Boolean, nullable=False, default=False, server_default="false")
    repeat_interval = Column(BigInteger, nullable=True)
    repeat_metric = Column(String(40), nullable=True)
    repeat_metric_interval = Column(BigInteger, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    priority = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    updated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    actions = relationship("RewardPolicyAction", back_populates="policy", lazy="select",
                           order_by="RewardPolicyAction.sort_order")

    __table_args__ = (
        Index("idx_reward_policy_active", "is_active", "priority",
              postgresql_where=(is_active.is_(True))),
    )


class RewardPolicyAction(Base):
    __tablename__ = "reward_policy_action"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    policy_id = Column(BigInteger, ForeignKey("reward_policy.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(
        Enum(RewardActionTypeEnum, name="reward_action_type_enum", create_type=False),
        nullable=False,
    )
    value = Column(Integer, nullable=False, default=0, server_default="0")
    ref_id = Column(String(64), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")

    policy = relationship("RewardPolicy", back_populates="actions")

    __table_args__ = (
        Index("idx_policy_action_policy", "policy_id", "sort_order"),
    )


class UserPolicyLog(Base):
    __tablename__ = "user_policy_log"

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id"), nullable=False)
    policy_id = Column(BigInteger, ForeignKey("reward_policy.id"), nullable=False)
    trigger_snapshot = Column(JSONB, nullable=True)
    rewarded_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        Index("idx_policy_log_user_policy", "user_id", "policy_id", rewarded_at.desc()),
    )


class SreSeedConfig(Base):
    __tablename__ = "sre_seed_config"

    seed_code = Column(String(60), primary_key=True)
    value_text = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")


class SreQuestCard(Base):
    __tablename__ = "sre_quest_card"

    card_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id"), nullable=False)
    external_quest_id = Column(String(64), nullable=False)
    user_quest_id = Column(String(64), nullable=False)
    card_type = Column(
        Enum(QuestCardTypeEnum, name="quest_card_type_enum", create_type=False),
        nullable=False,
    )
    criteria = Column(JSONB, nullable=False)
    # 검증기 런타임 진행상태 (count_event 카운터 등). 타입별로 키 자유.
    progress = Column(JSONB, nullable=False, default=dict, server_default="'{}'::jsonb")
    current_distance_m = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(
        Enum(QuestCardStatusEnum, name="quest_card_status_enum", create_type=False),
        nullable=False, default=QuestCardStatusEnum.ACTIVE, server_default="ACTIVE",
    )
    accepted_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")
    completed_at = Column(_TS, nullable=True)
    expires_at = Column(_TS, nullable=True)

    last_lat = Column(Numeric(9, 6), nullable=True)
    last_lng = Column(Numeric(9, 6), nullable=True)
    last_speed_kmh = Column(Numeric(6, 2), nullable=True)
    last_gps_at = Column(_TS, nullable=True)
    distance_to_target_m = Column(Integer, nullable=True)

    __table_args__ = (
        Index("idx_quest_card_user_active", "user_id", "status",
              postgresql_where="status = 'ACTIVE'"),
    )
