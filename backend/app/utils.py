import hashlib
import hmac
import os
from base64 import urlsafe_b64encode

IMGPROXY_BASE_URL = os.getenv("IMGPROXY_BASE_URL", "http://localhost:18090/img")
IMGPROXY_KEY = os.getenv("IMGPROXY_KEY", "")
IMGPROXY_SALT = os.getenv("IMGPROXY_SALT", "")

DEFAULT_AVATAR_FILE_PATH = "system/saigon-default.jpg"


def build_imgproxy_url(file_path: str) -> str:
    source = f"local:///{file_path}"
    path = f"/plain/{source}"

    if IMGPROXY_KEY and IMGPROXY_SALT:
        key = bytes.fromhex(IMGPROXY_KEY)
        salt = bytes.fromhex(IMGPROXY_SALT)
        digest = hmac.new(key, salt + path.encode(), hashlib.sha256).digest()
        signature = urlsafe_b64encode(digest).rstrip(b"=").decode()
        return f"{IMGPROXY_BASE_URL}/{signature}{path}"

    return f"{IMGPROXY_BASE_URL}/insecure{path}"


def default_avatar_url() -> str:
    return build_imgproxy_url(DEFAULT_AVATAR_FILE_PATH)
