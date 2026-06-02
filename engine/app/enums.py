import enum


class AccountTypeEnum(str, enum.Enum):
    STANDARD = "STANDARD"
    DRIVER = "DRIVER"
    BUSINESS = "BUSINESS"


class UserStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DELETED = "DELETED"


class EventStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSED = "PROCESSED"
    REJECTED = "REJECTED"
    REFUNDED = "REFUNDED"


class MissionStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class TxTypeEnum(str, enum.Enum):
    EARN = "EARN"
    REDEEM = "REDEEM"
    EXPIRE = "EXPIRE"
    ADJUST_PLUS = "ADJUST_PLUS"
    ADJUST_MINUS = "ADJUST_MINUS"
    REFUND = "REFUND"


class ExpireStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PARTIALLY_USED = "PARTIALLY_USED"
    EXPIRED = "EXPIRED"
    FULLY_USED = "FULLY_USED"


class IntegrationTypeEnum(str, enum.Enum):
    INTERNAL = "INTERNAL"
    GOTIT = "GOTIT"
    URBOX = "URBOX"
    TELCO = "TELCO"
    MANUAL = "MANUAL"


class RedemptionStatusEnum(str, enum.Enum):
    REQUESTED = "REQUESTED"
    FULFILLED = "FULFILLED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"


class AbuseSeverityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AbuseActionEnum(str, enum.Enum):
    LOG = "LOG"
    REDUCE = "REDUCE"
    REJECT = "REJECT"
    SUSPEND = "SUSPEND"


class CollectionStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    RETIRED = "RETIRED"
    UPCOMING = "UPCOMING"


class ItemSlotEnum(str, enum.Enum):
    # 라이더 장비
    HELMET = "HELMET"
    JACKET = "JACKET"
    GLOVES = "GLOVES"
    EYEWEAR = "EYEWEAR"
    BOOTS = "BOOTS"
    PANTS = "PANTS"
    KNEE = "KNEE"
    # 바이크 파츠
    BODY = "BODY"
    ENGINE = "ENGINE"
    SEAT = "SEAT"
    STICKER = "STICKER"
    HANDLE = "HANDLE"
    MIRROR = "MIRROR"
    LIGHT = "LIGHT"
    TAIL = "TAIL"
    NUMBER = "NUMBER"
    WHEEL = "WHEEL"
    # 프로필
    NAME = "NAME"
    RANK = "RANK"
    FRAME = "FRAME"
    TITLE = "TITLE"
    BACKDROP = "BACKDROP"
    # 이펙트
    TRAIL = "TRAIL"
    START = "START"
    HORN = "HORN"
    # 소셜
    BANNER = "BANNER"
    EMOTE = "EMOTE"
    PET = "PET"


class ItemRarityEnum(str, enum.Enum):
    C = "C"
    R = "R"
    E = "E"
    L = "L"
    M = "M"


class ItemEffectEnum(str, enum.Enum):
    RP_MULT = "RP_MULT"
    GOLD_MULT = "GOLD_MULT"
    QUEST_SLOT = "QUEST_SLOT"
    COST_DISCOUNT = "COST_DISCOUNT"


class AcquisitionSourceEnum(str, enum.Enum):
    MISSION = "MISSION"
    SEASON_PASS = "SEASON_PASS"
    SHOP = "SHOP"
    LOOTBOX = "LOOTBOX"
    TIER_REWARD = "TIER_REWARD"
    REFERRAL = "REFERRAL"
    EVENT = "EVENT"
    ADMIN_GRANT = "ADMIN_GRANT"


class SeasonStatusEnum(str, enum.Enum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class BoxStatusEnum(str, enum.Enum):
    UNOPENED = "UNOPENED"
    OPENED = "OPENED"
    EXPIRED = "EXPIRED"


class GachaStatusEnum(str, enum.Enum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class RewardActionTypeEnum(str, enum.Enum):
    GRANT_EXP = "GRANT_EXP"
    GRANT_BADGE = "GRANT_BADGE"
    GRANT_XP = "GRANT_XP"
    GRANT_GOLD = "GRANT_GOLD"


class QuestCardTypeEnum(str, enum.Enum):
    DISTANCE = "DISTANCE"
    CHECKPOINT = "CHECKPOINT"


class QuestCardStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
