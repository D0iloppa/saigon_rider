"""Publish / verify / withdraw / sync. Every function runs in the caller's transaction (caller commits).

fm_publication.files contract: {"index.html": str, "facts.json": str} for business (served at /b/<slug>/ and
/b/<slug>/facts.json) and for the platform hub (index.html /l/, index.ko.html /ko/l/, index.en.html /en/l/, facts.json /l/facts.json).
Bodies are stored exactly as served.
"""
from __future__ import annotations

import asyncio
import functools
import hashlib
import json
import logging
import os
import urllib.error
import urllib.request
from html import escape
from types import SimpleNamespace
from typing import Optional
from urllib.parse import urljoin, urlsplit

from app.models import BusinessProfile, utcnow
from app.utils import find_nearest_ward_id
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from factmind_saigon.core import locale as _locale
from factmind_saigon.core.bundle import PAGE_STYLE, publication_bundle
from factmind_saigon.core.fetch import MAX_BYTES, fetch_public, html_facts
from factmind_saigon.core.verify import verify_publication

from .constants import USER_AGENT, public_origin
from .lists import BRAND, LOCALES, PREFIX, alternate_links, hub_regions
from .storage import (
    FmEvent,
    FmPublication,
    FmSnapshot,
    FmSubject,
    list_published_business,
    record_event,
)
from .subjects import (
    business_snapshot,
    digest_of,
    editable_platform_facts,
    load_platform_seed,
    make_slug,
    platform_snapshot,
)

log = logging.getLogger(__name__)

# core.bundle insists on an https origin without port; render with this placeholder, then rewrite to the real origin.
_PLACEHOLDER_ORIGIN = "https://fm-origin.invalid"

HUB_TEXTS = {
    "vi": {"service_area": "Khu vực phục vụ: ", "wards": "Số khu (phường) đang phục vụ: ", "businesses_h2": "Cửa hàng đã đăng ký",
           "businesses_count": "Số cửa hàng đã đăng ký: ", "regions_h2": "Khu vực"},
    "ko": {"service_area": "서비스 지역: ", "wards": "서비스 중인 동(ward) 수: ", "businesses_h2": "등록된 가게",
           "businesses_count": "등록된 가게 수: ", "regions_h2": "지역"},
    "en": {"service_area": "Service area: ", "wards": "Wards served: ", "businesses_h2": "Registered shops",
           "businesses_count": "Registered shops: ", "regions_h2": "Areas"},
}


class FmError(Exception):
    def __init__(self, code: str, reason: Optional[str] = None):
        super().__init__(code if reason is None else code + ":" + reason)
        self.code = code
        self.reason = reason


async def _lock_subject(db: AsyncSession, subject_id) -> FmSubject:
    subject = (await db.execute(select(FmSubject).where(FmSubject.id == subject_id).with_for_update())).scalar_one_or_none()
    if subject is None:
        raise FmError("not_found")
    return subject


async def _latest_snapshot(db: AsyncSession, subject_id) -> Optional[FmSnapshot]:
    return (
        await db.execute(
            select(FmSnapshot).where(FmSnapshot.subject_id == subject_id).order_by(FmSnapshot.version.desc()).limit(1)
        )
    ).scalar_one_or_none()


async def store_snapshot(db: AsyncSession, subject: FmSubject, data: dict, force_new: bool = False) -> FmSnapshot:
    """Snapshots are immutable: reuse the latest when its source_digest matches, else append version+1."""
    latest = await _latest_snapshot(db, subject.id)
    if latest is not None and latest.source_digest == data["source_digest"] and not force_new:
        return latest
    snap = FmSnapshot(
        subject_id=subject.id,
        version=(latest.version if latest else 0) + 1,
        facts=data["facts"],
        jsonld=data["jsonld"],
        source_digest=data["source_digest"],
    )
    db.add(snap)
    await db.flush()
    return snap


def _ld_script(data: dict) -> str:
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("<", "\\u003c") + "</script>"


def _render_business(subject: FmSubject, snap: FmSnapshot, origin: str) -> dict:
    slug, locale = subject.slug, subject.locale_source
    url = origin + "/b/" + slug + "/"
    bundle = publication_bundle(
        {"api": snap.facts, "jsonld": {"@type": "LocalBusiness"}, "lastmod": snap.created_at.isoformat()},
        slug,
        _PLACEHOLDER_ORIGIN,
        locale=locale,
    )
    prefix = "profiles/" + slug + "/"
    html = bundle[prefix + "index.html"]
    html = html.replace(_PLACEHOLDER_ORIGIN + "/" + prefix, url).replace(_PLACEHOLDER_ORIGIN, origin)
    # swap core's generic schema block for the full LocalBusiness (telephone, image, isPartOf ...)
    start = html.rfind('<script type="application/ld+json">')
    end = html.find("</script>", start) + len("</script>")
    ld = {**snap.jsonld, "@id": url + "#entity", "url": url, "mainEntityOfPage": url}
    html = html[:start] + _ld_script(ld) + html[end:]
    return {"index.html": html, "facts.json": bundle[prefix + "facts.json"]}


def _render_hub(snap: FmSnapshot, origin: str, entries: list, regions: list) -> dict:
    files = {
        "index.html": _render_hub_page(snap, origin, entries, regions, "vi"),
        "index.ko.html": _render_hub_page(snap, origin, entries, regions, "ko"),
        "index.en.html": _render_hub_page(snap, origin, entries, regions, "en"),
    }
    files["facts.json"] = json.dumps(snap.facts, ensure_ascii=False, indent=2)
    return files


def _render_hub_page(snap: FmSnapshot, origin: str, entries: list, regions: list, locale: str) -> str:
    L = _locale.get(locale)
    T, H = L["TEXTS"], HUB_TEXTS[locale]
    api = snap.facts
    f = api["facts"]
    url = origin + PREFIX[locale] + "/l/"

    def tx(d):
        return d.get(locale) or d["vi"]

    name, desc, area = tx(f["name"]), tx(f["description"]), tx(f["service_area"])
    faq = "".join("<dt>" + escape(tx(i["q"])) + "</dt><dd>" + escape(tx(i["a"])) + "</dd>" for i in f["faq"])
    entries = sorted(entries, key=lambda e: (e["name"], e["url"]))
    listing = ""
    if entries:
        listing = (
            "<h2>" + H["businesses_h2"] + "</h2><ul>"
            + "".join(
                '<li><a href="' + escape(e["url"], quote=True) + '">' + escape(e["name"]) + "</a>"
                + ("<small>" + escape(e["category"]) + "</small>" if e["category"] else "") + "</li>"
                for e in entries
            )
            + "</ul>"
        )
    if regions:
        listing += (
            "<h2>" + H["regions_h2"] + "</h2><ul>"
            + "".join(
                '<li><a href="' + escape(PREFIX[locale] + "/l/" + r["slug"] + "/", quote=True) + '">' + escape(r["names"][locale]) + "</a></li>"
                for r in regions
            )
            + "</ul>"
        )
    body = (
        '<p class="lead">' + escape(desc) + "</p><p>" + H["service_area"] + escape(area) + "</p><p>" + H["wards"]
        + str(f["ward_count"]) + " · " + H["businesses_count"] + str(f["business_count"]) + "</p><h2>" + T["faq_h2"]
        + "</h2><dl>" + faq + "</dl>" + listing
    )
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {**{k: v for k, v in snap.jsonld.items() if k != "@context"}},
            {
                "@type": "CollectionPage",
                "url": url,
                "name": name,
                "mainEntity": {
                    "@type": "ItemList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": i + 1, "url": e["url"], "name": e["name"]} for i, e in enumerate(entries)
                    ],
                },
            },
        ],
    }
    style = PAGE_STYLE + "dt{font-weight:700;margin-top:16px}dd{margin:2px 0 0}main>p.lead{color:#192335;font-weight:650}"
    html = (
        '<!doctype html><html lang="' + L["LANG"] + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<link rel="canonical" href="' + escape(url, quote=True) + '">' + alternate_links(origin, "/l/") + "<title>" + escape(name) + "</title>"
        '<meta name="description" content="' + escape(desc[:160], quote=True) + '">'
        '<meta property="og:type" content="website"><meta property="og:site_name" content="' + BRAND + '">'
        '<meta property="og:locale" content="' + L["OG_LOCALE"] + '"><meta property="og:title" content="' + escape(name, quote=True) + '">'
        '<meta property="og:url" content="' + escape(url, quote=True) + '"><style>' + style + "</style></head><body>"
        '<nav><a href="/">' + BRAND + "</a></nav><main><h1>" + escape(name) + "</h1>" + body + "</main>" + _ld_script(graph) + "</body></html>"
    )
    return html


def _hub_entries(rows: list, origin: str) -> list:
    return [
        {"name": snap.facts["name"], "url": origin + "/b/" + s.slug + "/", "category": snap.facts["facts"].get("category") or ""}
        for s, _p, snap in rows
    ]


async def publish(db: AsyncSession, subject_id, snapshot_id=None) -> dict:
    """Lock subject -> snapshot -> files -> supersede old -> new published row. `changed` False when bytes are identical.

    snapshot_id (platform only): re-render from that existing snapshot (live counts refreshed in memory, no new snapshot)
    instead of the operator's latest draft facts -- used by refresh_hub so unpublished drafts never leak.
    """
    subject = await _lock_subject(db, subject_id)
    origin = public_origin()
    if subject.kind == "business":
        profile = await db.get(BusinessProfile, subject.source_ref) if subject.source_ref else None
        if profile is None or profile.status != "APPROVED":
            raise FmError("not_publishable", "profile_not_approved")
        if not subject.slug:  # fixed at first publish, never recomputed
            subject.slug = make_slug(profile.name, profile.id)
        subject.ward_id = (
            await find_nearest_ward_id(db, float(profile.latitude), float(profile.longitude))
            if profile.latitude is not None and profile.longitude is not None else None
        )
        subject.category_code = profile.category
        snap = await store_snapshot(db, subject, await business_snapshot(db, profile, subject.locale_source))
        files = _render_business(subject, snap, origin)
        url = origin + "/b/" + subject.slug + "/"
    else:
        if snapshot_id is not None:
            snap = await db.get(FmSnapshot, snapshot_id)
            fresh = await platform_snapshot(db, editable_platform_facts(snap.facts))
            view = SimpleNamespace(facts=fresh["facts"], jsonld=fresh["jsonld"])
        else:
            latest = await _latest_snapshot(db, subject.id)
            if latest is None:
                raise FmError("not_publishable", "no_facts")
            snap = view = await store_snapshot(db, subject, await platform_snapshot(db, editable_platform_facts(latest.facts)))
        rows = await list_published_business(db)
        files = _render_hub(view, origin, _hub_entries(rows, origin), await hub_regions(db, rows))
        url = origin + "/l/"

    artifact_digest = digest_of(files)
    current = (
        await db.execute(
            select(FmPublication).where(FmPublication.subject_id == subject.id, FmPublication.status == "published")
        )
    ).scalar_one_or_none()
    if current is not None and current.artifact_digest == artifact_digest and subject.status == "published":
        return _publish_result(subject, current, url, False, False)

    await db.execute(
        update(FmPublication)
        .where(FmPublication.subject_id == subject.id, FmPublication.status == "published")
        .values(status="superseded")
    )
    pub = FmPublication(
        subject_id=subject.id, snapshot_id=snap.id, status="published", files=files,
        artifact_digest=artifact_digest, published_at=utcnow(),
    )
    db.add(pub)
    subject.status = "published"
    subject.updated_at = utcnow()
    await db.flush()
    await record_event(
        db, "publish",
        {"publication_id": str(pub.id), "snapshot_id": str(snap.id), "version": snap.version, "artifact_digest": artifact_digest, "url": url},
        subject.id,
    )
    return _publish_result(subject, pub, url, True, current is not None)


def _publish_result(subject, pub, url, changed, replaced) -> dict:
    return {
        "publication_id": str(pub.id), "slug": subject.slug, "url": url, "artifact_digest": pub.artifact_digest,
        "published_at": pub.published_at, "changed": changed, "replaced": replaced,
    }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def make_reader(origin: str):
    """Public https reader (core C1) in prod; with FM_VERIFY_BASE_URL (dev) a plain GET against that base with a Host header."""
    base = (os.getenv("FM_VERIFY_BASE_URL") or "").strip().rstrip("/")
    if not base:
        return functools.partial(fetch_public, user_agent=USER_AGENT)
    host = urlsplit(origin).netloc
    opener = urllib.request.build_opener(_NoRedirect)

    def read(url: str) -> dict:
        parts = urlsplit(url)
        req = urllib.request.Request(
            base + (parts.path or "/") + ("?" + parts.query if parts.query else ""),
            headers={"Host": host, "User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
        )
        try:
            with opener.open(req, timeout=10) as resp:
                status, headers, raw = resp.status, resp.headers, resp.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as e:  # 3xx/4xx/5xx: still evidence
            status, headers, raw = e.code, e.headers, e.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("too_large")
        lowered = {k.lower(): v for k, v in headers.items()}
        text = raw.decode("utf-8-sig")
        final = urljoin(url, lowered["location"]) if 300 <= status < 400 and lowered.get("location") else url
        return {
            "url": url, "final_url": final, "observed_at": utcnow().isoformat(), "http_status": status, "headers": lowered,
            "body_sha256": hashlib.sha256(raw).hexdigest(), "response_text": text, "reader": "internal_http", **html_facts(text),
        }

    return read


def _checks(origin: str, subject: FmSubject, files: dict) -> list:
    """[(url, body, kind)] of a publication's live pages and facts.json; the one source of the URLs verify reads and IndexNow submits."""
    base_url = origin + ("/b/" + subject.slug + "/" if subject.kind == "business" else "/l/")
    checks = [(base_url, files["index.html"], "profile"), (base_url + "facts.json", files["facts.json"], "facts")]
    if subject.kind == "platform":
        for loc in LOCALES[1:]:
            if "index." + loc + ".html" in files:
                checks.append((origin + PREFIX[loc] + "/l/", files["index." + loc + ".html"], "profile_" + loc))
    return checks


async def verify(db: AsyncSession, subject_id) -> dict:
    """No row lock is held across the network read; the result is written only if the publication is still live.

    Sends nothing: `indexnow_urls` in the result are for the caller to submit after commit (routes_admin)."""
    subject = (await db.execute(select(FmSubject).where(FmSubject.id == subject_id))).scalar_one_or_none()
    if subject is None:
        raise FmError("not_found")
    pub = (
        await db.execute(
            select(FmPublication).where(FmPublication.subject_id == subject.id, FmPublication.status == "published")
        )
    ).scalar_one_or_none()
    if pub is None:
        raise FmError("not_publishable", "not_published")
    pub_id = pub.id
    origin = public_origin()
    checks = _checks(origin, subject, pub.files)
    base_url = checks[0][0]
    snap = await db.get(FmSnapshot, pub.snapshot_id)
    result = await asyncio.to_thread(
        verify_publication, checks, make_reader(origin), base_url, snap.facts["name"], subject.locale_source
    )
    pub = (
        await db.execute(
            select(FmPublication)
            .where(FmPublication.id == pub_id, FmPublication.status == "published")
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if pub is None:
        return {"ok": False, "problems": [{"reason_code": "publication_changed"}]}
    now = utcnow()
    ok = not result["problems"] and bool(result["records"])
    pub.verification = {"ok": ok, "problems": result["problems"], "checked": result["records"], "at": now.isoformat()}
    pub.verified_at = now if ok else None
    await record_event(db, "verify", {"publication_id": str(pub.id), "ok": ok, "problems": result["problems"]}, subject.id)
    urls = [u for u, _b, kind in checks if kind != "facts"] if ok and pub.index_notified_at is None else []
    return {"ok": ok, "verified_at": pub.verified_at, "problems": result["problems"], "checked": result["records"], "indexnow_urls": urls}


async def withdraw(db: AsyncSession, subject_id, reason: Optional[str] = None) -> dict:
    subject = await _lock_subject(db, subject_id)
    if subject.status != "published":
        raise FmError("not_publishable", "not_published")
    now = utcnow()
    live = (
        await db.execute(select(FmPublication.files).where(FmPublication.subject_id == subject.id, FmPublication.status == "published"))
    ).scalar_one()
    urls = [u for u, _b, kind in _checks(public_origin(), subject, live) if kind != "facts"]
    await db.execute(
        update(FmPublication)
        .where(FmPublication.subject_id == subject.id, FmPublication.status == "published")
        .values(status="withdrawn")
    )
    subject.status = "withdrawn"
    subject.updated_at = now
    body = {"slug": subject.slug}
    if reason:
        body["reason"] = reason
    await record_event(db, "withdraw", body, subject.id)
    return {"status": "withdrawn", "withdrawn_at": now, "indexnow_urls": urls}


async def refresh_hub(db: AsyncSession) -> bool:
    """Republish the platform hub when it is live (its business list depends on what is published). True if it changed."""
    platform = (
        await db.execute(select(FmSubject).where(FmSubject.kind == "platform", FmSubject.status == "published"))
    ).scalar_one_or_none()
    if platform is None:
        return False
    live = (
        await db.execute(
            select(FmPublication.snapshot_id).where(FmPublication.subject_id == platform.id, FmPublication.status == "published")
        )
    ).scalar_one()
    return bool((await publish(db, platform.id, live))["changed"])


async def ensure_platform_subject(db: AsyncSession) -> tuple:
    """(subject, created). New platform subject is a draft with the seed facts as snapshot v1; publishing is the operator's."""
    subject = (await db.execute(select(FmSubject).where(FmSubject.kind == "platform"))).scalar_one_or_none()
    if subject is not None:
        return subject, False
    subject = FmSubject(kind="platform", status="draft", locale_source="vi")
    db.add(subject)
    await db.flush()
    await store_snapshot(db, subject, await platform_snapshot(db, load_platform_seed()))
    return subject, True


async def _auto_withdrawn(db: AsyncSession, subject_id) -> bool:
    """True when the latest withdraw event of this subject was made by sync (profile left APPROVED), not by an operator."""
    body = (
        await db.execute(
            select(FmEvent.body).where(FmEvent.subject_id == subject_id, FmEvent.kind == "withdraw").order_by(FmEvent.id.desc()).limit(1)
        )
    ).scalar_one_or_none()
    return bool(body) and body.get("reason") == "profile_not_approved"


async def sync(db: AsyncSession) -> dict:
    """Mirror APPROVED business_profile rows into fm_subject and auto-publish new/changed ones.

    Published subjects whose profile is no longer APPROVED are withdrawn (reason profile_not_approved); on re-approval only
    those auto-withdrawn ones are republished -- an operator's own withdraw (no reason) stays withdrawn.
    """
    profiles = (await db.execute(select(BusinessProfile).where(BusinessProfile.status == "APPROVED"))).scalars().all()
    existing = {
        s.source_ref: s for s in (await db.execute(select(FmSubject).where(FmSubject.kind == "business"))).scalars().all()
    }
    approved = {p.id for p in profiles}
    created = updated = published = republished = auto_withdrawn = errors = 0
    to_notify = []  # (subject_id, urls) of auto-withdrawn pages; the caller submits them after commit
    for ref, subject in existing.items():
        if subject.status == "published" and ref not in approved:
            to_notify.append((subject.id, (await withdraw(db, subject.id, "profile_not_approved"))["indexnow_urls"]))
            auto_withdrawn += 1
    for profile in profiles:
        subject = existing.get(profile.id)
        resumed = False
        if subject is None:
            subject = FmSubject(kind="business", source_ref=profile.id, status="draft", locale_source="vi")
            db.add(subject)
            await db.flush()
            created += 1
        elif subject.status == "withdrawn":
            if not await _auto_withdrawn(db, subject.id):
                continue
            resumed = True
        try:
            async with db.begin_nested():  # one bad profile must not poison the batch
                result = await publish(db, subject.id)
        except Exception:
            log.exception("fm sync: publish failed for profile %s", profile.id)
            errors += 1
            continue
        if result["changed"]:
            if resumed:
                republished += 1
            else:
                published += 1
                updated += 1 if result["replaced"] else 0

    platform, platform_created = await ensure_platform_subject(db)
    platform_state = "created" if platform_created else platform.status
    if (published or republished or auto_withdrawn) and platform.status == "published" and await refresh_hub(db):
        platform_state = "republished"
    return {
        "created": created, "updated": updated, "published": published, "republished": republished,
        "auto_withdrawn": auto_withdrawn, "errors": errors, "platform": platform_state, "indexnow": to_notify,
    }
