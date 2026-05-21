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
    MOTORCYCLE_BODY = "MOTORCYCLE_BODY"
    SEAT = "SEAT"
    STICKER = "STICKER"
    RANK_CARD = "RANK_CARD"
    HANDLEBAR = "HANDLEBAR"
    TAIL_LIGHT = "TAIL_LIGHT"
    ENGINE_COVER = "ENGINE_COVER"
    HEADLIGHT = "HEADLIGHT"
    MIRROR = "MIRROR"
    NUMBER = "NUMBER"
    GLOVES = "GLOVES"
    BOOTS = "BOOTS"
    EYEWEAR = "EYEWEAR"
    NAMEPLATE = "NAMEPLATE"
    FRAME = "FRAME"
    BACKDROP = "BACKDROP"
    TITLE = "TITLE"
    TRAIL = "TRAIL"
    HORN = "HORN"
    START_ANIM = "START_ANIM"
    EMOTE = "EMOTE"
    BANNER = "BANNER"
    PET = "PET"


class ItemRarityEnum(str, enum.Enum):
    C = "C"
    R = "R"
    E = "E"
    L = "L"
    M = "M"


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
