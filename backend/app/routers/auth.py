import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from ..database import get_db
from ..models import User
from ..schemas import RegisterRequest, LoginRequest, RegisterResponse, LoginResponse, UserOut

router = APIRouter(prefix="/auth", tags=["인증 (Auth)"])

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _hash(passcode: str) -> str:
    return pwd_ctx.hash(passcode)


def _verify(passcode: str, hashed: str) -> bool:
    return pwd_ctx.verify(passcode, hashed)


@router.post("/register", response_model=RegisterResponse, summary="회원가입 / passcode 재발급",
             response_description="발급된 passcode와 유저 정보")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    전화번호로 신규 가입.
    - 이미 가입된 번호면 `is_new=False` + 새 passcode 재발급 (분실 복구 용도)
    - passcode는 UUID 기반 32자 문자열로 발급되며 bcrypt 해시로 저장됨
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


@router.post("/login", response_model=LoginResponse, summary="로그인",
             response_description="유저 정보")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """전화번호 + passcode 검증 후 유저 정보 반환."""
    result = await db.execute(select(User).where(User.phone == body.phone.strip()))
    user = result.scalar_one_or_none()

    if user is None or user.passcode_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not _verify(body.passcode, user.passcode_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid passcode")

    return LoginResponse(user=UserOut.model_validate(user))


@router.get("/me", response_model=LoginResponse, summary="유저 조회",
            response_description="유저 정보")
async def get_me_by_phone(phone: str, db: AsyncSession = Depends(get_db)):
    """phone 쿼리 파라미터로 유저 조회. 프로필 설정 완료 후 최신 정보 갱신 용도."""
    result = await db.execute(select(User).where(User.phone == phone.strip()))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=UserOut.model_validate(user))
