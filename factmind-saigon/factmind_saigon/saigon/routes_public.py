"""Public FactMind routes — serve published bundles at /b/<slug>/ and /l/ (plan §4 P3).

nginx sends /b /l /ko/l /en/l /sitemap*.xml /rss.xml here. Sitemap/RSS stay P1 skeletons until P4.
"""
from __future__ import annotations

from urllib.parse import urlsplit

from app.database import get_db
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from .constants import public_origin
from .storage import get_platform_publication, get_published_by_slug, is_withdrawn_slug

router = APIRouter(tags=["fm-public"], include_in_schema=False)

_XML = '<?xml version="1.0" encoding="UTF-8"?>'
_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_RSS_DESC = (
    "Saigon Rider gói mua bán đồ cũ với hàng xóm, tin tức quán xá khu phố, "
    "bản đồ khu phố và thông tin thiết yếu cho tài xế vào một ứng dụng duy nhất."
)
_TYPES = {"index.html": "text/html; charset=utf-8", "facts.json": "application/json"}


def _not_found() -> PlainTextResponse:
    return PlainTextResponse("Not Found", status_code=404)


def _serve(files: dict, name: str, request: Request) -> Response:
    body = files.get(name)
    if body is None:
        return _not_found()
    headers = {"Cache-Control": "public, max-age=300"}
    # app./business. 호스트로 열린 사본은 중복 색인 방지
    if request.headers.get("host") != urlsplit(public_origin()).netloc:
        headers["X-Robots-Tag"] = "noindex"
    return Response(body, media_type=_TYPES[name], headers=headers)


async def _business(db: AsyncSession, slug: str, name: str, request: Request) -> Response:
    if await is_withdrawn_slug(db, slug):
        return PlainTextResponse("Gone", status_code=410)
    pub = await get_published_by_slug(db, slug)
    return _serve(pub.files, name, request) if pub else _not_found()


async def _platform(db: AsyncSession, name: str, request: Request) -> Response:
    pub = await get_platform_publication(db)
    return _serve(pub.files, name, request) if pub else _not_found()


@router.get("/b/{slug}/")
async def business_index(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _business(db, slug, "index.html", request)


@router.get("/b/{slug}/facts.json")
async def business_facts(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _business(db, slug, "facts.json", request)


@router.get("/b/{slug}")
async def business_slash(slug: str) -> RedirectResponse:
    return RedirectResponse(f"/b/{slug}/", status_code=301)


@router.get("/l/")
async def platform_index(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "index.html", request)


@router.get("/l/facts.json")
async def platform_facts(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    return await _platform(db, "facts.json", request)


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
def sitemap_fm() -> Response:
    return Response(f'{_XML}<urlset xmlns="{_NS}"></urlset>', media_type="application/xml")


@router.get("/rss.xml")
def rss() -> Response:
    body = (
        f'{_XML}<rss version="2.0"><channel><title>SAIGON RIDER</title>'
        f"<link>{public_origin()}/</link><description>{_RSS_DESC}</description>"
        "<language>vi</language></channel></rss>"
    )
    return Response(body, media_type="application/rss+xml")


# 구체 경로 뒤에 선언 — 나머지 하위 경로(P4 범위)는 404
@router.get("/b/{path:path}")
@router.get("/l/{path:path}")
@router.get("/ko/l/{path:path}")
@router.get("/en/l/{path:path}")
def not_found(path: str) -> PlainTextResponse:
    return _not_found()
