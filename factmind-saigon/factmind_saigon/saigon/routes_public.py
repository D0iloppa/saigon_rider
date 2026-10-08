"""Public FactMind routes — published bundles at /b/<slug>/ and /l/ (P3); ward/category lists, sitemap-fm, RSS (P4).

nginx sends /b /l /ko/l /en/l /sitemap*.xml /rss.xml here.
"""
from __future__ import annotations

from email.utils import format_datetime
from html import escape
from typing import Optional
from urllib.parse import urlsplit

from app.database import get_db
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from .constants import public_origin
from .indexnow import configured_key
from .lists import LOCALES, PREFIX, live_businesses, locale_of_path, render_list_for, ward_slug
from .storage import get_platform_publication, get_published_by_slug, is_platform_withdrawn, is_withdrawn_slug

router = APIRouter(tags=["fm-public"], include_in_schema=False)

_XML = '<?xml version="1.0" encoding="UTF-8"?>'
_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_RSS_DESC = (
    "Saigon Rider gói mua bán đồ cũ với hàng xóm, tin tức quán xá khu phố, "
    "bản đồ khu phố và thông tin thiết yếu cho tài xế vào một ứng dụng duy nhất."
)
_HTML = "text/html; charset=utf-8"
_TYPES = {"index.html": _HTML, "index.ko.html": _HTML, "index.en.html": _HTML, "facts.json": "application/json"}


def _not_found() -> PlainTextResponse:
    return PlainTextResponse("Not Found", status_code=404)


def _respond(body: str, media_type: str, request: Request) -> Response:
    headers = {"Cache-Control": "public, max-age=300"}
    # app./business. 호스트로 열린 사본은 중복 색인 방지
    # nginx forwards Host as $host (no port), so compare hostnames only.
    if request.headers.get("host", "").split(":")[0] != (urlsplit(public_origin()).hostname or ""):
        headers["X-Robots-Tag"] = "noindex"
    return Response(body, media_type=media_type, headers=headers)


def _serve(files: dict, name: str, request: Request) -> Response:
    body = files.get(name)
    return _not_found() if body is None else _respond(body, _TYPES[name], request)


async def _business(db: AsyncSession, slug: str, name: str, request: Request) -> Response:
    if await is_withdrawn_slug(db, slug):
        return PlainTextResponse("Gone", status_code=410)
    pub = await get_published_by_slug(db, slug)
    return _serve(pub.files, name, request) if pub else _not_found()


async def _platform(db: AsyncSession, name: str, request: Request) -> Response:
    if await is_platform_withdrawn(db):
        return PlainTextResponse("Gone", status_code=410)
    pub = await get_platform_publication(db)
    return _serve(pub.files, name, request) if pub else _not_found()


@router.get("/b/{slug}/")
async def business_index(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _business(db, slug, "index.html", request)


@router.get("/b/{slug}/facts.json")
async def business_facts(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _business(db, slug, "facts.json", request)


@router.get("/b/{key}.txt")
def indexnow_key_file(key: str) -> Response:
    configured = configured_key()
    return PlainTextResponse(configured) if configured and key == configured else _not_found()


@router.get("/b/{slug}")
async def business_slash(slug: str) -> RedirectResponse:
    return RedirectResponse(f"/b/{slug}/", status_code=301)


@router.get("/l/")
async def platform_index(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "index.html", request)


@router.get("/l/facts.json")
async def platform_facts(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "facts.json", request)


@router.get("/ko/l/")
async def platform_index_ko(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "index.ko.html", request)


@router.get("/en/l/")
async def platform_index_en(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "index.en.html", request)


async def _list(db: AsyncSession, request: Request, ward: str, category: Optional[str]) -> Response:
    html = await render_list_for(db, public_origin(), locale_of_path(request.url.path), ward, category)
    return _not_found() if html is None else _respond(html, _HTML, request)


@router.get("/l/{ward}/")
@router.get("/ko/l/{ward}/")
@router.get("/en/l/{ward}/")
async def ward_list(ward: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _list(db, request, ward, None)


@router.get("/l/{ward}/{category}/")
@router.get("/ko/l/{ward}/{category}/")
@router.get("/en/l/{ward}/{category}/")
async def category_list(ward: str, category: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _list(db, request, ward, category)


@router.get("/sitemap.xml")
def sitemap_index() -> Response:
    origin = public_origin()
    body = (
        f'{_XML}<sitemapindex xmlns="{_NS}">'
        f"<sitemap><loc>{origin}/sitemap-fm.xml</loc></sitemap>"
        f"<sitemap><loc>{origin}/sitemap-site.xml</loc></sitemap>"
        "</sitemapindex>"
    )
    return Response(body, media_type="application/xml")


@router.get("/sitemap-fm.xml")
async def sitemap_fm(db: AsyncSession = Depends(get_db)) -> Response:
    origin = public_origin()
    wards, cats, rows = await live_businesses(db)
    urls = [(origin + "/b/" + s.slug + "/", p.published_at) for s, p, _n in rows]
    hub = await get_platform_publication(db)
    if hub is not None:
        urls += [(origin + PREFIX[loc] + "/l/", None) for loc in LOCALES if ("index.html" if loc == "vi" else "index." + loc + ".html") in hub.files]
    latest: dict = {}  # list tail -> newest published_at inside it
    for s, p, _n in rows:
        if s.ward_id not in wards:
            continue
        tails = ["/l/" + ward_slug(wards[s.ward_id].code) + "/"]
        if s.category_code in cats:
            tails.append(tails[0] + s.category_code + "/")
        for tail in tails:
            latest[tail] = max(latest.get(tail, p.published_at), p.published_at)
    urls += [(origin + PREFIX[loc] + tail, at) for tail, at in sorted(latest.items()) for loc in LOCALES]
    rows_xml = "".join(
        "<url><loc>" + escape(loc) + "</loc>" + ("<lastmod>" + at.date().isoformat() + "</lastmod>" if at else "") + "</url>" for loc, at in urls
    )
    return Response(f'{_XML}<urlset xmlns="{_NS}">{rows_xml}</urlset>', media_type="application/xml")


@router.get("/rss.xml")
async def rss(db: AsyncSession = Depends(get_db)) -> Response:
    origin = public_origin()
    _wards, _cats, rows = await live_businesses(db)
    items = "".join(
        "<item><title>" + escape(n.facts["name"]) + "</title><link>" + escape(origin + "/b/" + s.slug + "/") + "</link>"
        + '<guid isPermaLink="true">' + escape(origin + "/b/" + s.slug + "/") + "</guid>"
        + "<pubDate>" + format_datetime(p.published_at) + "</pubDate><description>"
        + escape((n.facts["facts"].get("intro") or n.facts["facts"].get("address") or "")[:200]) + "</description></item>"
        for s, p, n in sorted(rows, key=lambda r: r[1].published_at, reverse=True)[:50]
    )
    body = (
        f'{_XML}<rss version="2.0"><channel><title>SAIGON RIDER</title>'
        f"<link>{origin}/</link><description>{_RSS_DESC}</description>"
        f"<language>vi</language>{items}</channel></rss>"
    )
    return Response(body, media_type="application/rss+xml")


# 구체 경로 뒤에 선언 — 나머지 하위 경로(P4 범위)는 404
@router.get("/b/{path:path}")
@router.get("/l/{path:path}")
@router.get("/ko/l/{path:path}")
@router.get("/en/l/{path:path}")
def not_found(path: str) -> PlainTextResponse:
    return _not_found()
