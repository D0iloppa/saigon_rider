from pydantic import BaseModel, field_validator
from uuid import UUID
from datetime import datetime

from .utils import default_avatar_url


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

    @field_validator("avatar_url", mode="before")
    @classmethod
    def fill_default_avatar(cls, v):
        return v if v is not None else default_avatar_url()


class RegisterResponse(BaseModel):
    passcode: str
    is_new: bool
    user: UserOut


class LoginResponse(BaseModel):
    user: UserOut


class NicknameUpdateRequest(BaseModel):
    user_id: UUID
    nickname: str


class AvatarUpdateResponse(BaseModel):
    user: UserOut
    content_id: UUID


class ContentOut(BaseModel):
    id: UUID
    owner_type: str
    owner_id: UUID | None
    file_path: str
    mime_type: str | None
    original_filename: str | None
    file_size: int | None
    imgproxy_url: str
    created_at: datetime

    model_config = {"from_attributes": True}
