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

DEFAULT_AVATAR_FILE_PATH = "system/saigon-default.jpg"
MOCK_IMG_ENDPOINT = f"{BFF_PUBLIC_URL}/contents/mock-img"


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


def default_avatar_url() -> str:
    return build_imgproxy_url(DEFAULT_AVATAR_FILE_PATH)
