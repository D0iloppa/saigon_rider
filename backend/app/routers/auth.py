import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from ..database import get_db
from ..models import User
from ..schemas import RegisterRequest, LoginRequest, RegisterResponse, LoginResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _hash(passcode: str) -> str:
    return pwd_ctx.hash(passcode)


def _verify(passcode: str, hashed: str) -> bool:
    return pwd_ctx.verify(passcode, hashed)


@router.post("/register", response_model=RegisterResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    전화번호로 신규 가입.
    - 이미 가입된 번호면 is_new=False + 새 passcode 재발급 (passcode 분실 복구 용도)
    """
    phone = body.phone.strip()
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    raw_passcode = str(uuid.uuid4()).replace("-", "")
    hashed = _hash(raw_passcode)

    if user is None:
        user = User(phone=phone, passcode_hash=hashed)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        is_new = True
    else:
        user.passcode_hash = hashed
        await db.commit()
        await db.refresh(user)
        is_new = False

    return RegisterResponse(
        passcode=raw_passcode,
        is_new=is_new,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    전화번호 + passcode 로 로그인.
    """
    result = await db.execute(select(User).where(User.phone == body.phone.strip()))
    user = result.scalar_one_or_none()

    if user is None or user.passcode_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not _verify(body.passcode, user.passcode_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid passcode")

    return LoginResponse(user=UserOut.model_validate(user))


@router.get("/me", response_model=LoginResponse)
async def get_me_by_phone(phone: str, db: AsyncSession = Depends(get_db)):
    """
    phone 쿼리로 현재 유저 조회 (프로필 설정 후 갱신용).
    """
    result = await db.execute(select(User).where(User.phone == phone.strip()))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=UserOut.model_validate(user))
