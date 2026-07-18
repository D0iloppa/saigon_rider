"""앱 사용자 공개 API — 공지사항/FAQ 조회.

master.py(Ward/District 등 마스터 데이터) 와 동일하게 인증 없이 공개 조회한다.
공지·FAQ 는 사용자 세션과 무관하게 누구나 볼 수 있는 정적 콘텐츠이므로
verify_user_session 을 걸지 않는 것이 기존 마스터 데이터 라우터 관례와 일치한다.

lang 폴백: 요청한 lang(ko/en) 컬럼이 NULL 이거나 lang 이 vi/ko/en 이 아니면 vi 값을 쓴다.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Faq, Notice

router = APIRouter(tags=["공지사항/FAQ"])

_LANGS = {"vi", "ko", "en"}


def _localized(obj, field: str, lang: str | None) -> str:
    lang = (lang or "vi").lower()
    if lang not in _LANGS:
        lang = "vi"
    value = getattr(obj, f"{field}_{lang}", None)
    return value if value else getattr(obj, f"{field}_vi")


# ── 공지사항 ─────────────────────────────────────────────────────


class NoticeRow(BaseModel):
    id: int
    title: str
    is_pinned: bool
    published_at: datetime | None


class NoticeDetail(NoticeRow):
    body: str


@router.get("/notices", response_model=list[NoticeRow])
async def list_notices(lang: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    notices = (
        (
            await db.execute(
                select(Notice)
                .where(Notice.is_published == True)
                .order_by(Notice.is_pinned.desc(), Notice.published_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        NoticeRow(
            id=n.id,
            title=_localized(n, "title", lang),
            is_pinned=n.is_pinned,
            published_at=n.published_at,
        )
        for n in notices
    ]


@router.get("/notices/{notice_id}", response_model=NoticeDetail)
async def get_notice(notice_id: int, lang: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    notice = await db.get(Notice, notice_id)
    if notice is None or not notice.is_published:
        raise HTTPException(status_code=404, detail="Notice not found")
    return NoticeDetail(
        id=notice.id,
        title=_localized(notice, "title", lang),
        body=_localized(notice, "body", lang),
        is_pinned=notice.is_pinned,
        published_at=notice.published_at,
    )


# ── FAQ ─────────────────────────────────────────────────────────


class FaqRow(BaseModel):
    id: int
    category: str
    question: str
    answer: str


@router.get("/faqs", response_model=list[FaqRow])
async def list_faqs(lang: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    faqs = (
        (await db.execute(select(Faq).where(Faq.is_published == True).order_by(Faq.category, Faq.sort_order)))
        .scalars()
        .all()
    )
    return [
        FaqRow(
            id=f.id,
            category=f.category,
            question=_localized(f, "question", lang),
            answer=_localized(f, "answer", lang),
        )
        for f in faqs
    ]
