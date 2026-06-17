import logging
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import Translation
from ..schemas import TranslateRequest, TranslateResponse
from ..services.translate import SUPPORTED_LANGS, provider_translate, resolve_config, source_hash

router = APIRouter(prefix="/translate", tags=["번역 (Translation)"])
log = logging.getLogger(__name__)

_LANG_ATTR = {"ko": "text_ko", "en": "text_en", "vi": "text_vi"}


@router.post("", response_model=TranslateResponse, summary="실시간 번역(원문 해시 캐시)")
async def translate(
    body: TranslateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid=Depends(verify_user_session),
):
    target = body.target_lang
    if target not in SUPPORTED_LANGS:
        raise HTTPException(status_code=400, detail="unsupported target_lang")

    text = body.text.strip()
    if not text:
        return TranslateResponse(translated=body.text, target_lang=target, source_lang=body.source_lang, cached=True)
    # 원문 언어 == 대상 언어면 번역 불필요(비용 0)
    if body.source_lang and body.source_lang == target:
        return TranslateResponse(translated=text, target_lang=target, source_lang=body.source_lang, cached=True)

    h = source_hash(text)
    attr = _LANG_ATTR[target]

    # 캐시 히트 → API 호출 없이 반환
    row = await db.get(Translation, h)
    if row is not None and getattr(row, attr):
        return TranslateResponse(
            translated=getattr(row, attr), target_lang=target, source_lang=row.source_lang, cached=True
        )

    # 키 해석(env 우선 → DB app_config 폴백). 키 없으면 stub.
    api_key, provider = await resolve_config(db)

    # 캐시 미스 → provider 호출(키 없으면 stub=원문) 후 적재
    try:
        translated, detected = await provider_translate(text, target, body.source_lang, api_key, provider)
    except (httpx.HTTPError, httpx.RequestError) as exc:
        log.warning("translate provider failed: %s", exc)
        raise HTTPException(status_code=502, detail="translation provider error") from exc

    # stub(키 미발급) 결과는 캐시 저장 안 함 — 키 발급 후 원문=번역 오염 방지
    if not api_key:
        return TranslateResponse(translated=translated, target_lang=target, source_lang=body.source_lang, cached=False)

    if row is None:
        row = Translation(source_hash=h, source_lang=body.source_lang or detected, source_text=text)
        db.add(row)
    setattr(row, attr, translated)
    if not row.source_lang:
        row.source_lang = body.source_lang or detected
    row.updated_at = datetime.now(UTC)
    await db.commit()
    return TranslateResponse(translated=translated, target_lang=target, source_lang=row.source_lang, cached=False)
