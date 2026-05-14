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
