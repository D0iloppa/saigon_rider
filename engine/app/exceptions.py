from fastapi import HTTPException, status


class SreBaseException(Exception):
    pass


class UserNotFoundError(SreBaseException):
    pass


class DuplicateEventError(SreBaseException):
    """멱등성 키 충돌 — 이미 처리된 이벤트."""
    pass


class DailyCapExceededError(SreBaseException):
    pass


class AbuseRejectedError(SreBaseException):
    pass


class InsufficientBalanceError(SreBaseException):
    pass


class RewardUnavailableError(SreBaseException):
    pass


# HTTP 변환 헬퍼
def raise_not_found(detail: str = "Not found") -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def raise_conflict(detail: str = "Conflict") -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def raise_unprocessable(detail: str = "Unprocessable") -> None:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
