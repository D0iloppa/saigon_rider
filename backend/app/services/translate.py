"""실시간 번역 provider — 키 해석(env 우선 → DB app_config 폴백) + stub.

키 해석 순서:
  1) 환경변수 TRANSLATE_API_KEY (12-factor·프로덕션 시크릿매니저 호환)
  2) DB app_config (group_name='translate', key='api_key') — 어드민 런타임 교체용

키가 어디에도 없으면 stub(원문 반환) → 키 발급 전에도 흐름 동작.
⚠️ app_config의 시크릿은 클라이언트 /app-config 화이트리스트에 없으므로 노출되지 않음.
"""

import hashlib
import logging
import os
import time

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppConfig

log = logging.getLogger(__name__)

_ENV_KEY = os.getenv("TRANSLATE_API_KEY", "")
_ENV_PROVIDER = os.getenv("TRANSLATE_PROVIDER", "")
SUPPORTED_LANGS = ("ko", "en", "vi")
CONFIG_GROUP = "translate"

# DB 설정은 로딩 후 캐시(매 호출 조회 X). 키 로테이션은 TTL 내 자동 반영.
_CONFIG_TTL = 300.0
_config_cache: tuple[float, str, str] | None = None  # (expires_at, api_key, provider)


def source_hash(text: str) -> str:
    """원문(trim) sha256 — 캐시 키."""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def resolve_config(db: AsyncSession) -> tuple[str, str]:
    """(api_key, provider) 해석 — env 우선, 없으면 app_config('translate') 폴백(TTL 캐시)."""
    if _ENV_KEY:
        return _ENV_KEY, (_ENV_PROVIDER or "google")

    global _config_cache
    now = time.monotonic()
    if _config_cache is not None and _config_cache[0] > now:
        return _config_cache[1], _config_cache[2]

    rows = (await db.execute(select(AppConfig).where(AppConfig.group_name == CONFIG_GROUP))).scalars().all()
    cfg = {r.key: r.value for r in rows}
    api_key = cfg.get("api_key", "")
    provider = cfg.get("provider") or _ENV_PROVIDER or "google"
    _config_cache = (now + _CONFIG_TTL, api_key, provider)
    return api_key, provider


async def provider_translate(
    text: str, target_lang: str, source_lang: str | None, api_key: str, provider: str = "google"
) -> tuple[str, str | None]:
    """(translated_text, detected_source_lang) 반환. 키 없으면 stub(원문 반환)."""
    if not api_key:
        return text, source_lang

    if provider == "google":
        params = {"key": api_key, "q": text, "target": target_lang, "format": "text"}
        if source_lang:
            params["source"] = source_lang
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post("https://translation.googleapis.com/language/translate/v2", params=params)
            resp.raise_for_status()
            tr = resp.json()["data"]["translations"][0]
            return tr["translatedText"], tr.get("detectedSourceLanguage", source_lang)

    log.warning("Unknown translate provider=%s — stub fallback", provider)
    return text, source_lang
