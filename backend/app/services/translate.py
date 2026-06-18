"""실시간 번역 provider — 키 해석(env 우선 → DB app_config 폴백) + stub.

키 해석 순서:
  1) 환경변수 TRANSLATE_API_KEY (12-factor·프로덕션 시크릿매니저 호환)
  2) DB app_config (group_name='translate', key='api_key') — 어드민 런타임 교체용

키가 어디에도 없으면 stub(원문 반환) → 키 발급 전에도 흐름 동작.
⚠️ app_config의 시크릿은 클라이언트 /app-config 화이트리스트에 없으므로 노출되지 않음.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppConfig, Translation
from .redis_cache import get_client

log = logging.getLogger(__name__)

_ENV_KEY = os.getenv("TRANSLATE_API_KEY", "")
_ENV_PROVIDER = os.getenv("TRANSLATE_PROVIDER", "")
SUPPORTED_LANGS = ("ko", "en", "vi")
# 번들 키('kr'=한국어) ↔ DB 컬럼/내부코드('ko') 매핑
_LANG_ATTR = {"ko": "text_ko", "en": "text_en", "vi": "text_vi"}
_BUNDLE_KEY = {"ko": "kr", "en": "en", "vi": "vi"}
CONFIG_GROUP = "translate"

# 번역 번들 Redis 캐시 (fuel 캐시와 prefix 분리). 키 = saigon:tr:{원문해시}.
_TR_PREFIX = "saigon:tr:"
_TR_TTL = 60 * 60 * 24 * 30  # 30일

# 로컬 언어 감지(API 비용 0). 한글/베트남어 전용 문자로 판별, 그 외 라틴 = 영어.
_RE_HANGUL = re.compile(r"[가-힣㄰-㆏]")
# 베트남어 전용: 성조 결합 블록(U+1EA0-U+1EF9) + d/a/o/u 계열 변형 (영어엔 안 나타남)
_RE_VIET = re.compile(r"[Ạ-ỹĂăĐđƠơƯư]")


def detect_lang(text: str) -> str:
    """원문 → 'ko' | 'vi' | 'en' (로컬 휴리스틱, API 호출 없음).

    한글 음절/자모 → ko, 베트남어 전용 문자 → vi, 그 외 → en.
    ⚠️ 성조 없이 입력된 베트남어(순수 ASCII)는 en 으로 감지될 수 있음.
    """
    if _RE_HANGUL.search(text):
        return "ko"
    if _RE_VIET.search(text):
        return "vi"
    return "en"


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
    # 키가 설정된 경우만 캐시 — 미설정 시 매번 재조회(어드민이 키 넣으면 즉시 반영)
    if api_key:
        _config_cache = (now + _CONFIG_TTL, api_key, provider)
    return api_key, provider


async def provider_translate(
    text: str, target_lang: str, source_lang: str | None, api_key: str, provider: str = "google"
) -> tuple[str, str | None]:
    """(translated_text, detected_source_lang) 반환. 키 없으면 stub(원문 반환)."""
    if not api_key:
        return text, source_lang

    if provider == "google":
        # q/target/format 는 POST 바디로(긴 텍스트 URL 길이초과 방지). source 미전송=자동감지
        #  → 캐시가 (원문,대상)만으로 정합(요청자 source_lang 힌트가 결과를 바꾸지 않음).
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://translation.googleapis.com/language/translate/v2",
                params={"key": api_key},
                json={"q": text, "target": target_lang, "format": "text"},
            )
            resp.raise_for_status()
            tr = resp.json()["data"]["translations"][0]
            return tr["translatedText"], tr.get("detectedSourceLanguage", source_lang)

    log.warning("Unknown translate provider=%s — stub fallback", provider)
    return text, source_lang


async def translate_all(text: str, db: AsyncSession) -> dict[str, str]:
    """원문 1개 → 3개 언어 번들. 번역이 필요한 모든 서비스의 단일 진입점.

    동작:
      1) 로컬 언어감지(detect_lang) → 원문 슬롯은 그대로(번역 안 함).
      2) 나머지 2개 언어만 provider 호출(병렬). → 3회가 아닌 2회 번역.
      3) 번들 전체를 Redis(saigon:tr:{해시}, TTL 30일)에 캐시 — 히트 시 API 호출 0.
    반환: {"kr": ..., "en": ..., "vi": ..., "source_lang": "ko|en|vi"} (kr=한국어).
    키 미발급 시 stub(전부 원문) — 흐름은 동작, 캐시 저장은 생략.
    provider 오류는 호출자에게 전파(httpx 예외 등).
    """
    clean = text.strip()
    src = detect_lang(clean)
    if not clean:
        return {"kr": "", "en": "", "vi": "", "source_lang": src}

    h = source_hash(clean)
    cache_key = _TR_PREFIX + h
    client = await get_client()

    # 1계층: Redis 핫캐시
    cached = await client.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2계층: DB 영속 저장(translations) — 완전하면 Redis 워밍 후 반환
    row = await db.get(Translation, h)
    if row and row.text_ko and row.text_en and row.text_vi:
        bundle = {"kr": row.text_ko, "en": row.text_en, "vi": row.text_vi, "source_lang": row.source_lang or src}
        await client.set(cache_key, json.dumps(bundle, ensure_ascii=False), ex=_TR_TTL)
        return bundle

    # 3계층: provider — 원문 슬롯 제외 + DB에 이미 있는 언어 제외하고 부족분만 번역
    out: dict[str, str] = {src: clean}
    if row:
        for lang in SUPPORTED_LANGS:
            val = getattr(row, _LANG_ATTR[lang])
            if val:
                out[lang] = val
    need = [lang for lang in SUPPORTED_LANGS if lang != src and lang not in out]
    if need:
        api_key, provider = await resolve_config(db)
        results = await asyncio.gather(*(provider_translate(clean, lang, src, api_key, provider) for lang in need))
        for lang, (translated, _) in zip(need, results, strict=True):
            out[lang] = translated
    else:
        api_key, _ = await resolve_config(db)

    bundle = {"kr": out["ko"], "en": out["en"], "vi": out["vi"], "source_lang": src}
    # stub(키 미발급)은 저장 안 함 — 원문=번역 오염 방지
    if api_key:
        if row is None:
            row = Translation(source_hash=h, source_lang=src, source_text=clean)
            db.add(row)
        row.text_ko, row.text_en, row.text_vi = bundle["kr"], bundle["en"], bundle["vi"]
        if not row.source_lang:
            row.source_lang = src
        row.updated_at = datetime.now(UTC)
        await db.commit()
        await client.set(cache_key, json.dumps(bundle, ensure_ascii=False), ex=_TR_TTL)
    return bundle


async def lookup_lang_batch(texts: list[str], lang: str, db: AsyncSession) -> list[str]:
    """원문 리스트 → 각 lang 번역 (Redis MGET 1회 + DB IN 1회, API 호출 X).

    리스트 조회용 — 작성 시 워밍된 번역만 사용, 없으면 원문 폴백.
    단일 AsyncSession 동시접근을 피하려 per-item 조회 대신 배치(한 번에) 처리.
    """
    result = list(texts)
    if lang not in SUPPORTED_LANGS:
        return result

    # 번역이 필요한 항목(인덱스, 해시)만 수집 — 빈 문자열·원문언어 동일은 제외
    idx_hash: list[tuple[int, str]] = []
    for i, t in enumerate(texts):
        clean = t.strip() if t else ""
        if not clean or lang == detect_lang(clean):
            continue
        idx_hash.append((i, source_hash(clean)))
    if not idx_hash:
        return result

    client = await get_client()
    cached = await client.mget([_TR_PREFIX + h for _, h in idx_hash])
    misses: list[tuple[int, str]] = []
    for (i, h), raw in zip(idx_hash, cached, strict=True):
        if raw:
            val = json.loads(raw).get(_BUNDLE_KEY[lang])
            if val:
                result[i] = val
        else:
            misses.append((i, h))

    if misses:
        rows = (
            (await db.execute(select(Translation).where(Translation.source_hash.in_([h for _, h in misses]))))
            .scalars()
            .all()
        )
        by_hash = {r.source_hash: r for r in rows}
        for i, h in misses:
            row = by_hash.get(h)
            if row and getattr(row, _LANG_ATTR[lang]):
                result[i] = getattr(row, _LANG_ATTR[lang])
    return result


async def translate_to(text: str, lang: str, db: AsyncSession) -> str:
    """원문 → 해당 lang 번역 (필요 시 API 호출 + 워밍). 상세 단건 조회용."""
    clean = text.strip() if text else ""
    if not clean or lang not in SUPPORTED_LANGS:
        return text
    if lang == detect_lang(clean):
        return text
    bundle = await translate_all(clean, db)
    return bundle.get(_BUNDLE_KEY[lang]) or text


async def warm_translations(texts: list[str]) -> None:
    """작성 시 백그라운드 워밍 — 자체 DB 세션으로 translate_all 호출(3개국어 저장)."""
    from ..database import AsyncSessionLocal

    targets = [t for t in texts if t and t.strip()]
    if not targets:
        return
    async with AsyncSessionLocal() as db:
        for t in targets:
            try:
                await translate_all(t, db)
            except Exception as exc:  # 워밍 실패는 무시(조회 시 폴백·재시도)
                log.warning("translation warm failed: %s", exc)
