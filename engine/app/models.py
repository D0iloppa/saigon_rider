from sqlalchemy import (
    BigInteger, Boolean, Column, Enum, ForeignKey,
    Identity, Index, Integer, Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import relationship

from app.database import Base
from app.enums import (
    AbuseSeverityEnum, AbuseActionEnum, AccountTypeEnum,
    EventStatusEnum, ExpireStatusEnum, IntegrationTypeEnum,
    MissionStatusEnum, RedemptionStatusEnum, TxTypeEnum, UserStatusEnum,
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
    created_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    balance = relationship("RpBalance", back_populates="user", uselist=False, lazy="select")
    tier = relationship("UserTier", back_populates="user", uselist=False, lazy="select")


class ActionDefinition(Base):
    __tablename__ = "action_definition"

    action_code = Column(String(40), primary_key=True)
    category_code = Column(String(20), nullable=False)
    display_name = Column(String(80), nullable=False)
    base_rp = Column(Integer, nullable=False, default=0, server_default="0")
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
    calculated_rp = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
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
    reward_rp = Column(Integer, nullable=False)
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


class RpBalance(Base):
    __tablename__ = "rp_balance"

    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_balance_user"), primary_key=True)
    current_balance = Column(BigInteger, nullable=False, default=0, server_default="0")
    lifetime_earned = Column(BigInteger, nullable=False, default=0, server_default="0")
    lifetime_spent = Column(BigInteger, nullable=False, default=0, server_default="0")
    expiring_soon = Column(BigInteger, nullable=False, default=0, server_default="0")
    last_recalculated_at = Column(_TS, nullable=False, server_default="CURRENT_TIMESTAMP")

    user = relationship("SreUser", back_populates="balance")


class RpTransaction(Base):
    __tablename__ = "rp_transaction"

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


class RpExpirationSchedule(Base):
    __tablename__ = "rp_expiration_schedule"

    expire_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_exp_user"), nullable=False)
    source_transaction_id = Column(BigInteger, ForeignKey("rp_transaction.transaction_id", name="fk_exp_tx"), nullable=False)
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
    min_lifetime_rp = Column(BigInteger, nullable=False, default=0, server_default="0")
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
    required_rp = Column(Integer, nullable=False)
    face_value_vnd = Column(Integer, nullable=True)
    monthly_quota = Column(Integer, nullable=True)
    monthly_issued = Column(Integer, nullable=False, default=0, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    visible_from = Column(_TS, nullable=True)
    visible_until = Column(_TS, nullable=True)

    partner = relationship("RewardPartner", back_populates="catalogs")

    __table_args__ = (Index("idx_cat_active_visible", "is_active", "visible_from", "visible_until"),)


class RewardRedemption(Base):
    __tablename__ = "reward_redemption"

    redemption_id = Column(BigInteger, Identity(always=True), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("sre_user.user_id", name="fk_red_user"), nullable=False)
    catalog_id = Column(BigInteger, ForeignKey("reward_catalog.catalog_id", name="fk_red_catalog"), nullable=False)
    rp_transaction_id = Column(BigInteger, ForeignKey("rp_transaction.transaction_id", name="fk_red_tx"), nullable=True)
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
    uuid = Column(Text, nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(_TS, nullable=False, server_default="NOW()")
    _extra = Column("_extra", JSONB, nullable=False, server_default="{}")


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
