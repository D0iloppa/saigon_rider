"""OAuth 토큰 검증 서비스 — Google + Facebook + Apple (P0).

공통 OAuthProfile을 반환하며, 각 provider 검증기가 이 형태로 변환한다.

사용처: routers/auth.py POST /auth/oauth/login
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

log = logging.getLogger(__name__)

_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_FB_DEBUG_TOKEN_URL = "https://graph.facebook.com/debug_token"
_FB_ME_URL = "https://graph.facebook.com/me"

# JWKS 캐시 (60분 TTL)
_jwks_cache: tuple[float, dict] | None = None
_JWKS_TTL = 3600.0


@dataclass
class OAuthProfile:
    provider: str
    provider_user_id: str
    email: str | None
    display_name: str | None
    picture_url: str | None
    raw: dict


async def _fetch_google_jwks() -> dict:
    """Google 공개키 JWKS 캐시 반환 (TTL 60분)."""
    global _jwks_cache
    now = time.monotonic()
    if _jwks_cache and _jwks_cache[0] > now:
        return _jwks_cache[1]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_GOOGLE_CERTS_URL)
        resp.raise_for_status()
        jwks = resp.json()
    _jwks_cache = (now + _JWKS_TTL, jwks)
    return jwks


async def verify_google_token(id_token: str, client_id: str) -> OAuthProfile:
    """Google ID 토큰을 Google tokeninfo 엔드포인트로 검증한다.

    tokeninfo는 RTT가 있지만 서버사이드 JWKS 파싱 없이 신뢰성 있는 검증이 가능하다.
    고트래픽 시 JWKS 로컬 검증으로 교체 가능하나 P0에서는 단순성 우선.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_GOOGLE_TOKENINFO_URL, params={"id_token": id_token})

    if resp.status_code != 200:
        raise ValueError(f"Google token validation failed: {resp.text}")

    info: dict[str, Any] = resp.json()

    if info.get("error"):
        raise ValueError(f"Google token error: {info['error']}")

    if info.get("aud") != client_id:
        raise ValueError(f"Google token aud mismatch: expected {client_id}, got {info.get('aud')}")

    sub = info.get("sub")
    if not sub:
        raise ValueError("Google token missing sub")

    return OAuthProfile(
        provider="google",
        provider_user_id=sub,
        email=info.get("email"),
        display_name=info.get("name"),
        picture_url=info.get("picture"),
        raw=info,
    )


_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def exchange_google_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> OAuthProfile:
    """Authorization code를 Google token endpoint에서 토큰으로 교환 후 프로필을 반환한다."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise ValueError(f"Google code exchange failed: {resp.text}")
    tokens = resp.json()
    id_token = tokens.get("id_token")
    if not id_token:
        raise ValueError("No id_token in Google token response")
    return await verify_google_token(id_token, client_id)


_APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
_APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"

# Apple JWKS 캐시 (60분 TTL)
_apple_jwks_cache: tuple[float, list] | None = None


async def _fetch_apple_jwks() -> list:
    global _apple_jwks_cache
    now = time.monotonic()
    if _apple_jwks_cache and _apple_jwks_cache[0] > now:
        return _apple_jwks_cache[1]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_APPLE_KEYS_URL)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
    _apple_jwks_cache = (now + _JWKS_TTL, keys)
    return keys


def _make_apple_client_secret(team_id: str, client_id: str, key_id: str, private_key_pem: str) -> str:
    """Apple ES256 JWT client_secret 생성 (유효기간 180일)."""
    # DB에 \n 리터럴로 저장된 경우 실제 개행으로 변환
    pem = private_key_pem.replace("\\n", "\n")
    now = int(time.time())
    payload = {
        "iss": team_id,
        "iat": now,
        "exp": now + 86400 * 180,
        "aud": "https://appleid.apple.com",
        "sub": client_id,
    }
    return jwt.encode(payload, pem, algorithm="ES256", headers={"kid": key_id})


async def exchange_apple_code(
    code: str,
    team_id: str,
    client_id: str,
    key_id: str,
    private_key_pem: str,
    redirect_uri: str,
) -> OAuthProfile:
    """Apple authorization code를 token endpoint에서 교환 후 id_token을 검증한다."""
    client_secret = _make_apple_client_secret(team_id, client_id, key_id, private_key_pem)

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _APPLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
    if resp.status_code != 200:
        raise ValueError(f"Apple token exchange failed: {resp.text}")

    tokens = resp.json()
    id_token = tokens.get("id_token")
    if not id_token:
        raise ValueError("No id_token in Apple token response")

    # JWKS로 서명 검증
    jwks = await _fetch_apple_jwks()
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    key_data = next((k for k in jwks if k.get("kid") == kid), None)
    if key_data is None:
        raise ValueError(f"Apple JWKS key not found for kid={kid}")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
    claims: dict[str, Any] = jwt.decode(
        id_token,
        public_key,
        algorithms=["RS256"],
        audience=client_id,
    )

    sub = claims.get("sub")
    if not sub:
        raise ValueError("Apple id_token missing sub")

    return OAuthProfile(
        provider="apple",
        provider_user_id=sub,
        email=claims.get("email"),
        display_name=None,  # Apple은 최초 인증 시에만 name 제공 (form POST body에서 별도 파싱 필요)
        picture_url=None,
        raw=claims,
    )


_ZALO_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"
_ZALO_ME_URL = "https://graph.zalo.me/v2.0/me"


async def exchange_zalo_code(
    code: str,
    app_id: str,
    app_secret: str,
    code_verifier: str,
) -> OAuthProfile:
    """Zalo authorization code를 PKCE로 교환하고 사용자 프로필을 반환한다."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            _ZALO_TOKEN_URL,
            headers={"secret_key": app_secret},
            data={
                "code": code,
                "app_id": app_id,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
        )
    if token_resp.status_code != 200:
        raise ValueError(f"Zalo token exchange failed: {token_resp.text}")
    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise ValueError(f"No access_token in Zalo response: {token_data}")

    async with httpx.AsyncClient(timeout=10.0) as client:
        me_resp = await client.get(
            _ZALO_ME_URL,
            params={"fields": "id,name,picture"},
            headers={"access_token": access_token, "secret_key": app_secret},
        )
    if me_resp.status_code != 200:
        raise ValueError(f"Zalo /me failed: {me_resp.text}")
    me: dict[str, Any] = me_resp.json()

    zalo_id = str(me.get("id", ""))
    if not zalo_id:
        raise ValueError("Zalo /me missing id")

    picture_url: str | None = None
    if isinstance(me.get("picture"), dict):
        picture_url = me["picture"].get("data", {}).get("url")

    return OAuthProfile(
        provider="zalo",
        provider_user_id=zalo_id,
        email=None,  # Zalo는 이메일 미제공
        display_name=me.get("name"),
        picture_url=picture_url,
        raw=me,
    )


async def verify_facebook_token(access_token: str, app_id: str, app_secret: str) -> OAuthProfile:
    """Facebook access token을 Graph API debug_token으로 검증한다."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        debug_resp = await client.get(
            _FB_DEBUG_TOKEN_URL,
            params={
                "input_token": access_token,
                "access_token": f"{app_id}|{app_secret}",
            },
        )
        if debug_resp.status_code != 200:
            raise ValueError(f"Facebook debug_token failed: {debug_resp.text}")

        debug: dict[str, Any] = debug_resp.json().get("data", {})
        if not debug.get("is_valid"):
            raise ValueError("Facebook token is invalid")
        if str(debug.get("app_id")) != str(app_id):
            raise ValueError("Facebook token app_id mismatch")

        me_resp = await client.get(
            _FB_ME_URL,
            params={"fields": "id,name,email,picture", "access_token": access_token},
        )
        me_resp.raise_for_status()
        me: dict[str, Any] = me_resp.json()

    fb_id = me.get("id")
    if not fb_id:
        raise ValueError("Facebook /me missing id")

    picture_url: str | None = None
    if isinstance(me.get("picture"), dict):
        picture_url = me["picture"].get("data", {}).get("url")

    return OAuthProfile(
        provider="facebook",
        provider_user_id=fb_id,
        email=me.get("email"),
        display_name=me.get("name"),
        picture_url=picture_url,
        raw=me,
    )
