"""FactMind 공개 경로 골격 (P1) — nginx 가 /b /l /ko/l /en/l /sitemap*.xml /rss.xml 을 여기로 보낸다.

지금은 sitemap·rss 가 비어 있고 모든 페이지 경로는 404 다. 실제 페이지는 P3 에서
`factmind_saigon.saigon.routes_public` 으로 대체 예정 — ai-docs/spec/261008_fm_engine_port_plan.md §4.
"""

import os

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

router = APIRouter(tags=["fm-public"], include_in_schema=False)

# 빈 값(compose 가 `:-` 로 전달)도 기본값으로 떨어지도록 `or` 사용
ORIGIN = (os.getenv("FM_PUBLIC_ORIGIN") or "https://saigon-rider.com").rstrip("/")

_XML = '<?xml version="1.0" encoding="UTF-8"?>'
_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_RSS_DESC = (
    "Saigon Rider gói mua bán đồ cũ với hàng xóm, tin tức quán xá khu phố, "
    "bản đồ khu phố và thông tin thiết yếu cho tài xế vào một ứng dụng duy nhất."
)


@router.get("/sitemap.xml")
def sitemap_index() -> Response:
    body = (
        f'{_XML}<sitemapindex xmlns="{_NS}">'
        f"<sitemap><loc>{ORIGIN}/sitemap-fm.xml</loc></sitemap>"
        f"<sitemap><loc>{ORIGIN}/sitemap-site.xml</loc></sitemap>"
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
        f"<link>{ORIGIN}/</link><description>{_RSS_DESC}</description>"
        "<language>vi</language></channel></rss>"
    )
    return Response(body, media_type="application/rss+xml")


@router.get("/b/{path:path}")
@router.get("/l/{path:path}")
@router.get("/ko/l/{path:path}")
@router.get("/en/l/{path:path}")
def not_found(path: str) -> PlainTextResponse:
    return PlainTextResponse("Not Found", status_code=404)
