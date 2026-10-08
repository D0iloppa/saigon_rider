"""Admin FactMind routes (mounted by backend/app/routers/admin_api/fm.py)."""
import asyncio
import functools
import uuid
from typing import Literal, Optional
from urllib.parse import urlsplit

from app.admin_auth import AdminSession, verify_admin_api
from app.database import get_db
from app.models import BusinessProfile, Ward, utcnow
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from factmind_saigon.core.fetch import fetch_public
from factmind_saigon.core.site_report import diagnose_site

from . import publishing
from .indexnow import notify
from .constants import BOTS_VN, USER_AGENT, public_origin
from .storage import FmEvent, FmPublication, FmSnapshot, FmSubject
from .subjects import LOCALES, editable_platform_facts, platform_snapshot

router = APIRouter(prefix="/fm")


class DiagnoseRequest(BaseModel):
    url: str
    name: Optional[str] = None
    locale: Literal["ko-KR", "vi", "en"] = "ko-KR"


@router.post("/diagnose")
async def diagnose(
    body: DiagnoseRequest,
    _session: AdminSession = Depends(verify_admin_api),
):
    parts = urlsplit(body.url)
    if parts.scheme != "https":
        raise HTTPException(status_code=400, detail={"code": "https_only", "url": body.url})
    if not parts.netloc:
        raise HTTPException(status_code=400, detail={"code": "invalid_url", "url": body.url})
    reader = functools.partial(fetch_public, user_agent=USER_AGENT)
    try:
        # reader errors (FetchError) are swallowed by core and show up as skipped items.
        # core collectors use blocking http.client; keep them off the event loop.
        return await asyncio.to_thread(
            diagnose_site, body.url, body.name or "", reader,
            locale=body.locale, bots=BOTS_VN,
        )
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail={"code": "fetch_failed", "message": str(e)[:300]})


# ── subjects / publishing ───────────────────────────────────────────────────


async def _audit(db, session, request, action, target_id=None, detail=None):
    # lazy: admin_api/__init__ imports fm.py -> this module, so a top-level import of its _audit would be circular
    from app.routers.admin_api._audit import audit

    await audit(db, session, request, action, "fm_subject", target_id, detail)


def _http(e: publishing.FmError) -> HTTPException:
    if e.code == "not_found":
        return HTTPException(status_code=404, detail={"code": "not_found"})
    return HTTPException(status_code=409, detail={"code": e.code, "reason": e.reason})


def _event_row(e: FmEvent) -> dict:
    return {"id": e.id, "subject_id": e.subject_id, "kind": e.kind, "body": e.body, "created_at": e.created_at}


def _subject_row(subject: FmSubject, name, ward_name, pub: Optional[FmPublication]) -> dict:
    verification = pub.verification if pub is not None else None
    url = None
    if subject.status != "draft":
        url = public_origin() + ("/l/" if subject.kind == "platform" else "/b/" + subject.slug + "/" if subject.slug else "")
    return {
        "id": subject.id, "kind": subject.kind, "name": name or subject.slug or subject.kind, "slug": subject.slug,
        "status": subject.status, "ward_id": subject.ward_id, "ward_name": ward_name, "category_code": subject.category_code,
        "locale_source": subject.locale_source, "published_at": pub.published_at if pub is not None else None,
        "verified_at": pub.verified_at if pub is not None else None,
        "verification_ok": verification.get("ok") if verification else None, "updated_at": subject.updated_at,
        "url": url or None,
    }


def _subject_query():
    return (
        select(FmSubject, BusinessProfile.name, Ward.name_vi, FmPublication)
        .outerjoin(BusinessProfile, and_(FmSubject.kind == "business", BusinessProfile.id == FmSubject.source_ref))
        .outerjoin(Ward, Ward.id == FmSubject.ward_id)
        .outerjoin(FmPublication, and_(FmPublication.subject_id == FmSubject.id, FmPublication.status == "published"))
    )


@router.get("/subjects")
async def list_subjects(
    kind: Optional[Literal["platform", "business"]] = None,
    status: Optional[Literal["draft", "published", "withdrawn"]] = None,
    q: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    conds = []
    if kind:
        conds.append(FmSubject.kind == kind)
    if status:
        conds.append(FmSubject.status == status)
    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conds.append(or_(BusinessProfile.name.ilike(like), FmSubject.slug.ilike(like)))
    total = (
        await db.execute(
            select(func.count()).select_from(FmSubject)
            .outerjoin(BusinessProfile, and_(FmSubject.kind == "business", BusinessProfile.id == FmSubject.source_ref))
            .where(*conds)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            _subject_query().where(*conds)
            .order_by(FmSubject.kind.desc(), FmSubject.updated_at.desc(), FmSubject.id)
            .limit(limit).offset(offset)
        )
    ).all()
    published, withdrawn, verified = (
        await db.execute(
            select(
                func.count().filter(FmSubject.status == "published"),
                func.count().filter(FmSubject.status == "withdrawn"),
                func.count().filter(and_(FmSubject.status == "published", FmPublication.verification["ok"].astext == "true")),
            )
            .select_from(FmSubject)
            .outerjoin(FmPublication, and_(FmPublication.subject_id == FmSubject.id, FmPublication.status == "published"))
        )
    ).one()
    return {
        "items": [_subject_row(s, n, w, p) for s, n, w, p in rows], "total": total,
        "counts": {"published": published, "verified": verified, "withdrawn": withdrawn},
    }


@router.get("/subjects/{subject_id}")
async def get_subject(
    subject_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(_subject_query().where(FmSubject.id == subject_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    subject, name, ward_name, pub = row
    out = _subject_row(subject, name, ward_name, pub)
    out["publication"] = (
        {
            "id": pub.id, "artifact_digest": pub.artifact_digest, "files": sorted(pub.files),
            "published_at": pub.published_at, "verified_at": pub.verified_at, "verification": pub.verification,
            "index_notified_at": pub.index_notified_at,
        }
        if pub is not None else None
    )
    events = (
        await db.execute(select(FmEvent).where(FmEvent.subject_id == subject_id).order_by(FmEvent.id.desc()).limit(20))
    ).scalars().all()
    out["events"] = [_event_row(e) for e in events]
    return out


async def _notify_after_commit(db: AsyncSession, subject_id, urls: list, mark_published: bool = False) -> None:
    """IndexNow runs after the request's transaction is committed (no row lock held over the network), then a short write of its outcome."""
    sent = (await notify(db, subject_id, urls))["sent"]
    if sent and mark_published:
        await db.execute(
            update(FmPublication)
            .where(FmPublication.subject_id == subject_id, FmPublication.status == "published", FmPublication.index_notified_at.is_(None))
            .values(index_notified_at=utcnow())
        )
    await db.commit()


@router.post("/subjects/sync")
async def sync_subjects(
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    result = await publishing.sync(db)
    pending = result.pop("indexnow")
    await _audit(db, session, request, "FM_SYNC", None, result)
    await db.commit()
    for sid, urls in pending:
        await _notify_after_commit(db, sid, urls)
    return result


@router.post("/subjects/{subject_id}/publish")
async def publish_subject(
    subject_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await publishing.publish(db, subject_id)
        if result["changed"] and (await db.get(FmSubject, subject_id)).kind != "platform":
            await publishing.refresh_hub(db)  # hub lists live businesses; no-op when the hub is not live
    except publishing.FmError as e:
        raise _http(e)
    await _audit(db, session, request, "FM_PUBLISH", str(subject_id), {"artifact_digest": result["artifact_digest"], "changed": result["changed"]})
    await db.commit()
    return {k: result[k] for k in ("publication_id", "slug", "url", "artifact_digest", "published_at")}


@router.post("/subjects/{subject_id}/verify")
async def verify_subject(
    subject_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await publishing.verify(db, subject_id)
    except publishing.FmError as e:
        raise _http(e)
    urls = result.pop("indexnow_urls")
    await _audit(db, session, request, "FM_VERIFY", str(subject_id), {"ok": result["ok"]})
    await db.commit()
    if urls:
        await _notify_after_commit(db, subject_id, urls, mark_published=True)
    return result


@router.post("/subjects/{subject_id}/withdraw")
async def withdraw_subject(
    subject_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await publishing.withdraw(db, subject_id)
        if (await db.get(FmSubject, subject_id)).kind != "platform":
            await publishing.refresh_hub(db)
    except publishing.FmError as e:
        raise _http(e)
    urls = result.pop("indexnow_urls")
    await _audit(db, session, request, "FM_WITHDRAW", str(subject_id))
    await db.commit()
    await _notify_after_commit(db, subject_id, urls)
    return result


# ── platform facts (operator-edited, versioned as fm_snapshot) ──────────────


class PlatformFactsBody(BaseModel):
    facts: dict


def _i18n(value, label: str, errors: list) -> Optional[dict]:
    if not isinstance(value, dict) or any(not isinstance(value.get(k), str) or not value[k].strip() for k in LOCALES):
        errors.append(label)
        return None
    return {k: value[k].strip() for k in LOCALES}


def _validate_platform_facts(facts: dict) -> dict:
    errors: list = []
    out = {
        "name": _i18n(facts.get("name"), "name", errors),
        "description": _i18n(facts.get("description"), "description", errors),
        "service_area": _i18n(facts.get("service_area"), "service_area", errors),
    }
    same_as = facts.get("same_as", [])
    if not isinstance(same_as, list) or any(not isinstance(u, str) or not u.startswith(("https://", "http://")) for u in same_as):
        errors.append("same_as")
        same_as = []
    out["same_as"] = same_as
    faq = facts.get("faq")
    out["faq"] = []
    if not isinstance(faq, list) or not 1 <= len(faq) <= 10:
        errors.append("faq")
    else:
        for i, item in enumerate(faq):
            item = item if isinstance(item, dict) else {}
            out["faq"].append({
                "q": _i18n(item.get("q"), "faq[%d].q" % i, errors),
                "a": _i18n(item.get("a"), "faq[%d].a" % i, errors),
            })
    if errors:
        raise HTTPException(status_code=422, detail={"code": "invalid_platform_facts", "fields": errors})
    return out


async def _platform(db: AsyncSession, lock: bool = False):
    stmt = select(FmSubject).where(FmSubject.kind == "platform")
    if lock:
        stmt = stmt.with_for_update()  # serializes snapshot version numbering
    subject = (await db.execute(stmt)).scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    latest = (
        await db.execute(
            select(FmSnapshot).where(FmSnapshot.subject_id == subject.id).order_by(FmSnapshot.version.desc()).limit(1)
        )
    ).scalar_one()
    return subject, latest


@router.get("/platform-facts")
async def get_platform_facts(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    subject, latest = await _platform(db)
    return {
        "subject_id": subject.id, "version": latest.version,
        "facts": editable_platform_facts(latest.facts), "status": subject.status,
    }


@router.put("/platform-facts")
async def put_platform_facts(
    body: PlatformFactsBody,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    facts = _validate_platform_facts(body.facts)
    subject, _latest = await _platform(db, lock=True)
    snap = await publishing.store_snapshot(db, subject, await platform_snapshot(db, facts))
    await _audit(db, session, request, "FM_PLATFORM_FACTS", str(subject.id), {"version": snap.version})
    await db.commit()
    return {"version": snap.version}


@router.get("/events")
async def list_events(
    kind: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FmEvent).order_by(FmEvent.id.desc()).limit(limit)
    if kind:
        stmt = stmt.where(FmEvent.kind == kind)
    return {"items": [_event_row(e) for e in (await db.execute(stmt)).scalars().all()]}
