from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class RegisterRequest(BaseModel):
    phone: str   # "+84901234567" 형식


class LoginRequest(BaseModel):
    phone: str
    passcode: str


class UserOut(BaseModel):
    id: UUID
    phone: str
    nickname: str | None
    rider_type: str | None
    level: int
    exp: int
    xp: int
    gold: int
    skill_pt: int
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    passcode: str
    is_new: bool
    user: UserOut


class LoginResponse(BaseModel):
    user: UserOut
