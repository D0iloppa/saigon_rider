import hashlib
import hmac
import os
from base64 import urlsafe_b64encode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

IMGPROXY_BASE_URL = os.getenv("IMGPROXY_BASE_URL", "http://localhost:18090/img")
IMGPROXY_KEY = os.getenv("IMGPROXY_KEY", "")
IMGPROXY_SALT = os.getenv("IMGPROXY_SALT", "")
BFF_PUBLIC_URL = os.getenv("BFF_PUBLIC_URL", "http://localhost:8082")

# 일자 경계 계산용 타임존 (DAILY 퀘스트 period_key, ride streak, 월별 통계 등)
# .env 의 APP_TIMEZONE 값을 따른다. 미설정 또는 잘못된 값이면 Asia/Seoul 로 폴백.
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Seoul")
try:
    APP_TZ = ZoneInfo(APP_TIMEZONE)
except ZoneInfoNotFoundError:
    APP_TZ = ZoneInfo("Asia/Seoul")

MOCK_IMG_ENDPOINT = f"{BFF_PUBLIC_URL}/contents/mock-img"
# 프로필 사진 미설정 시 폴백 풀 (owner_type='profile_mock') 서빙 엔드포인트
PROFILE_MOCK_ENDPOINT = f"{BFF_PUBLIC_URL}/contents/profile-mock-img"


def build_imgproxy_url(file_path: str, options: str = "") -> str:
    # base64 인코딩: nginx의 merge_slashes가 local:/// 를 local:/ 로 압축하는 문제를 방지
    source = f"local:///{file_path}"
    encoded = urlsafe_b64encode(source.encode()).rstrip(b"=").decode()
    path = f"/{options}/{encoded}" if options else f"/{encoded}"

    if IMGPROXY_KEY and IMGPROXY_SALT:
        key = bytes.fromhex(IMGPROXY_KEY)
        salt = bytes.fromhex(IMGPROXY_SALT)
        digest = hmac.new(key, salt + path.encode(), hashlib.sha256).digest()
        signature = urlsafe_b64encode(digest).rstrip(b"=").decode()
        return f"{IMGPROXY_BASE_URL}/{signature}{path}"

    return f"{IMGPROXY_BASE_URL}/insecure{path}"


# 아바타 표시용 imgproxy 옵션 (정사각 크롭)
AVATAR_IMGPROXY_OPTIONS = "rs:fill:240:240:1"


def default_avatar_url(seed: str | None = None) -> str:
    """프로필 사진 미설정 시 폴백 URL — profile_mock 컨텐츠 풀에서 1장.

    seed(user_id 등)를 주면 풀에서 결정론적으로 동일 이미지를, 없으면 랜덤 반환한다.
    `/contents/profile-mock-img` 엔드포인트가 302 redirect 로 imgproxy URL 을 내려준다.
    """
    suffix = f"&seed={seed}" if seed else ""
    return f"{PROFILE_MOCK_ENDPOINT}?w=240&h=240{suffix}"


def resolve_avatar_url(user) -> str:
    """유저 프로필 이미지 URL 해석 — contents 중개(content_id) 우선, 없으면 프론트 default 이미지.

    우선순위: avatar_content (contents 테이블) > avatar_url (레거시) > default_avatar_url().
    """
    content = getattr(user, "avatar_content", None)
    if content is not None and getattr(content, "file_path", None):
        return build_imgproxy_url(content.file_path, options=AVATAR_IMGPROXY_OPTIONS)
    legacy = getattr(user, "avatar_url", None)
    if legacy:
        return legacy
    user_id = getattr(user, "id", None)
    return default_avatar_url(seed=str(user_id) if user_id else None)


def resolve_feed_image_url(post) -> str | None:
    """피드 이미지 URL 해석 — contents 중개(content_id) 우선, 없으면 레거시 image_url."""
    content = getattr(post, "image_content", None)
    if content is not None and getattr(content, "file_path", None):
        return build_imgproxy_url(content.file_path)
    return getattr(post, "image_url", None)


def exp_required_for_level(level: int) -> int:
    """레벨업에 필요한 EXP. frontend/src/lib/rewards.ts와 동일한 곡선."""
    if level <= 1:
        return 200
    if level == 2:
        return 500
    if level == 3:
        return 1000
    if level == 4:
        return 2000
    return exp_required_for_level(level - 1) * 2


def apply_level_up(user) -> int:
    """user.exp 기준으로 user.level 을 갱신. 멀티 레벨업 처리. 변경된 레벨 수 반환."""
    gained = 0
    while True:
        need = exp_required_for_level(user.level)
        if user.exp < need:
            break
        user.exp -= need
        user.level += 1
        gained += 1
    return gained


async def find_district_by_point(db, lat: float, lng: float) -> str | None:
    """PostGIS ST_Covers로 좌표가 속하는 구역 코드를 반환한다. 없으면 None."""
    from sqlalchemy import text

    row = (
        await db.execute(
            text(
                "SELECT code FROM districts "
                "WHERE boundary IS NOT NULL "
                "AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) "
                "LIMIT 1"
            ),
            {"lat": lat, "lng": lng},
        )
    ).first()
    return row[0] if row else None
