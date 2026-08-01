"""admin JSON API — 공지사항/FAQ/금칙어 CMS (notices/faqs/banned_keywords 테이블).

notices·faqs 는 vi 필수 + ko/en 선택 3개국어 컬럼을 그대로 노출/수정한다.
is_published 를 false→true 로 최초 전환하는 순간에만 published_at 을 1회 세팅한다
(이후 재발행해도 최초 발행 시각을 유지 — 발행 이력이 아닌 "최초 게시일" 의미).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import BannedKeyword, Faq, Notice, utcnow
from ...schemas import Page
from ._audit import audit

router = APIRouter(prefix="/cms")

_FAQ_CATEGORIES = {"GENERAL", "ACCOUNT", "MARKET", "RIDE", "REWARD"}


# ── 공지사항 ─────────────────────────────────────────────────────


class NoticeRow(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    title_vi: str
    title_ko: str | None
    title_en: str | None
    is_pinned: bool
    is_published: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NoticeDetail(NoticeRow):
    body_vi: str
    body_ko: str | None
    body_en: str | None


class NoticeCreate(BaseModel):
    title_vi: str = Field(min_length=1, max_length=200)
    title_ko: str | None = Field(None, max_length=200)
    title_en: str | None = Field(None, max_length=200)
    body_vi: str = Field(min_length=1)
    body_ko: str | None = None
    body_en: str | None = None
    is_pinned: bool = False


class NoticeUpdate(BaseModel):
    title_vi: str | None = Field(None, min_length=1, max_length=200)
    title_ko: str | None = Field(None, max_length=200)
    title_en: str | None = Field(None, max_length=200)
    body_vi: str | None = Field(None, min_length=1)
    body_ko: str | None = None
    body_en: str | None = None
    is_pinned: bool | None = None
    is_published: bool | None = None


async def _get_notice_or_404(db: AsyncSession, notice_id: int) -> Notice:
    notice = await db.get(Notice, notice_id)
    if notice is None:
        raise HTTPException(status_code=404, detail="Notice not found")
    return notice


@router.get("/notices", response_model=Page[NoticeRow])
async def list_notices(
    is_published: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    q = select(Notice)
    count_q = select(func.count()).select_from(Notice)
    if is_published is not None:
        q = q.where(Notice.is_published == is_published)
        count_q = count_q.where(Notice.is_published == is_published)

    total = (await db.execute(count_q)).scalar_one()
    notices = (
        (
            await db.execute(
                q.order_by(Notice.is_pinned.desc(), Notice.created_at.desc()).offset((page - 1) * size).limit(size)
            )
        )
        .scalars()
        .all()
    )
    return Page(items=[NoticeRow.model_validate(n) for n in notices], total=total, page=page, size=size)


@router.post("/notices", response_model=NoticeDetail)
async def create_notice(
    body: NoticeCreate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    notice = Notice(**body.model_dump())
    db.add(notice)
    await db.flush()
    await audit(db, session, request, "NOTICE_CREATE", "notice", str(notice.id), body.model_dump())
    await db.commit()
    await db.refresh(notice)
    return NoticeDetail.model_validate(notice)


@router.get("/notices/{notice_id}", response_model=NoticeDetail)
async def get_notice(
    notice_id: int,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    return NoticeDetail.model_validate(await _get_notice_or_404(db, notice_id))


@router.patch("/notices/{notice_id}", response_model=NoticeDetail)
async def update_notice(
    notice_id: int,
    body: NoticeUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    notice = await _get_notice_or_404(db, notice_id)

    changes = body.model_dump(exclude_unset=True)
    publish_toggled_on = changes.get("is_published") is True and not notice.is_published
    publish_toggled_off = changes.get("is_published") is False and notice.is_published

    for k, v in changes.items():
        setattr(notice, k, v)
    if publish_toggled_on and notice.published_at is None:
        notice.published_at = utcnow()

    action = "NOTICE_PUBLISH" if publish_toggled_on else "NOTICE_UNPUBLISH" if publish_toggled_off else "NOTICE_UPDATE"
    await audit(db, session, request, action, "notice", str(notice_id), changes)
    await db.commit()
    await db.refresh(notice)
    return NoticeDetail.model_validate(notice)


@router.delete("/notices/{notice_id}", status_code=204)
async def delete_notice(
    notice_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    notice = await _get_notice_or_404(db, notice_id)
    await db.delete(notice)
    await audit(db, session, request, "NOTICE_DELETE", "notice", str(notice_id))
    await db.commit()


# ── FAQ ─────────────────────────────────────────────────────────


class FaqRow(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    category: str
    question_vi: str
    question_ko: str | None
    question_en: str | None
    answer_vi: str
    answer_ko: str | None
    answer_en: str | None
    sort_order: int
    is_published: bool
    created_at: datetime
    updated_at: datetime


class FaqCreate(BaseModel):
    category: str = "GENERAL"
    question_vi: str = Field(min_length=1, max_length=300)
    question_ko: str | None = Field(None, max_length=300)
    question_en: str | None = Field(None, max_length=300)
    answer_vi: str = Field(min_length=1)
    answer_ko: str | None = None
    answer_en: str | None = None
    sort_order: int = 0
    is_published: bool = False


class FaqUpdate(BaseModel):
    category: str | None = None
    question_vi: str | None = Field(None, min_length=1, max_length=300)
    question_ko: str | None = Field(None, max_length=300)
    question_en: str | None = Field(None, max_length=300)
    answer_vi: str | None = Field(None, min_length=1)
    answer_ko: str | None = None
    answer_en: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None


def _check_category(category: str | None) -> None:
    if category is not None and category not in _FAQ_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"invalid category (allowed: {sorted(_FAQ_CATEGORIES)})")


async def _get_faq_or_404(db: AsyncSession, faq_id: int) -> Faq:
    faq = await db.get(Faq, faq_id)
    if faq is None:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return faq


@router.get("/faqs", response_model=list[FaqRow])
async def list_faqs(
    category: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _check_category(category)
    q = select(Faq)
    if category:
        q = q.where(Faq.category == category)
    faqs = (await db.execute(q.order_by(Faq.category, Faq.sort_order))).scalars().all()
    return [FaqRow.model_validate(f) for f in faqs]


@router.post("/faqs", response_model=FaqRow)
async def create_faq(
    body: FaqCreate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _check_category(body.category)
    faq = Faq(**body.model_dump())
    db.add(faq)
    await db.flush()
    await audit(db, session, request, "FAQ_CREATE", "faq", str(faq.id), body.model_dump())
    await db.commit()
    await db.refresh(faq)
    return FaqRow.model_validate(faq)


@router.get("/faqs/{faq_id}", response_model=FaqRow)
async def get_faq(
    faq_id: int,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    return FaqRow.model_validate(await _get_faq_or_404(db, faq_id))


@router.patch("/faqs/{faq_id}", response_model=FaqRow)
async def update_faq(
    faq_id: int,
    body: FaqUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    faq = await _get_faq_or_404(db, faq_id)
    _check_category(body.category)

    changes = body.model_dump(exclude_unset=True)
    publish_toggled_on = changes.get("is_published") is True and not faq.is_published
    publish_toggled_off = changes.get("is_published") is False and faq.is_published

    for k, v in changes.items():
        setattr(faq, k, v)

    action = "FAQ_PUBLISH" if publish_toggled_on else "FAQ_UNPUBLISH" if publish_toggled_off else "FAQ_UPDATE"
    await audit(db, session, request, action, "faq", str(faq_id), changes)
    await db.commit()
    await db.refresh(faq)
    return FaqRow.model_validate(faq)


@router.delete("/faqs/{faq_id}", status_code=204)
async def delete_faq(
    faq_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    faq = await _get_faq_or_404(db, faq_id)
    await db.delete(faq)
    await audit(db, session, request, "FAQ_DELETE", "faq", str(faq_id))
    await db.commit()


# ── 금칙어 ───────────────────────────────────────────────────────
# dm.py 의 _banned_keywords_cache TTL 이 60s 라 여기서 추가/삭제해도 DM 필터에는
# 최대 60초 지연 후 반영된다 (즉시 반영 아님 — 관리자 화면에 안내 문구로 노출).


class BannedKeywordRow(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    keyword: str
    note: str | None
    created_at: datetime


class BannedKeywordCreate(BaseModel):
    keyword: str = Field(min_length=1, max_length=60)
    note: str | None = Field(None, max_length=200)


@router.get("/banned-keywords", response_model=list[BannedKeywordRow])
async def list_banned_keywords(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(BannedKeyword).order_by(BannedKeyword.created_at.desc()))).scalars().all()
    return [BannedKeywordRow.model_validate(r) for r in rows]


@router.post("/banned-keywords", response_model=BannedKeywordRow)
async def create_banned_keyword(
    body: BannedKeywordCreate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    keyword = BannedKeyword(keyword=body.keyword.strip(), note=body.note, created_by=session.username)
    db.add(keyword)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="이미 등록된 키워드입니다.") from None
    await audit(
        db, session, request, "BANNED_KEYWORD_ADD", "banned_keyword", str(keyword.id), {"keyword": keyword.keyword}
    )
    await db.commit()
    await db.refresh(keyword)
    return BannedKeywordRow.model_validate(keyword)


@router.delete("/banned-keywords/{keyword_id}", status_code=204)
async def delete_banned_keyword(
    keyword_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    keyword = await db.get(BannedKeyword, keyword_id)
    if keyword is None:
        raise HTTPException(status_code=404, detail="Keyword not found")
    await db.delete(keyword)
    await audit(
        db, session, request, "BANNED_KEYWORD_DELETE", "banned_keyword", str(keyword_id), {"keyword": keyword.keyword}
    )
    await db.commit()
