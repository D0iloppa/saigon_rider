"""Ward / category list pages (plan §4 P4), generated per request from fm_* + wards/business_category (no stored copy).

core.bundle.list_page has no hreflang, breadcrumbs or sub-list links, so the page is assembled here (same plain-string style
as publishing._render_hub). Also holds the locale/URL helpers shared by hub, sitemap and routes.
"""
from __future__ import annotations

import json
from html import escape
from typing import Optional

from app.models import BusinessCategory, Ward
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from factmind_saigon.core import locale as _locale
from factmind_saigon.core.bundle import PAGE_STYLE

from .storage import list_published_business

BRAND = "Saigon Rider"  # core ko locale brand is upstream "FactMind"
LOCALES = ("vi", "ko", "en")
PREFIX = {"vi": "", "ko": "/ko", "en": "/en"}

LIST_TEXTS = {
    "vi": {"hub": "Danh sách cửa hàng", "categories": "Loại hình", "count": "{n} cửa hàng",
           "title_ward": "Cửa hàng tại {ward}", "title_cat": "{cat} tại {ward}",
           "desc": "{title} — {n} cửa hàng đã đăng ký trên Saigon Rider, sắp xếp theo tên."},
    "ko": {"hub": "가게 목록", "categories": "업종", "count": "업체 {n}곳",
           "title_ward": "{ward} 가게", "title_cat": "{ward} {cat}",
           "desc": "{title} — Saigon Rider에 등록된 {n}곳, 이름순."},
    "en": {"hub": "Shop directory", "categories": "Categories", "count": "{n} shops",
           "title_ward": "Shops in {ward}", "title_cat": "{cat} in {ward}",
           "desc": "{title} — {n} shops registered on Saigon Rider, listed by name."},
}


def ward_slug(code: str) -> str:
    return code.lower().replace("_", "-")


def ward_name(ward: Ward, locale: str) -> str:
    return {"vi": ward.name_vi, "ko": ward.name_ko or ward.name_en, "en": ward.name_en}[locale]


def cat_label(cat: BusinessCategory, locale: str) -> str:
    return getattr(cat, "label_" + locale)


def alternate_links(origin: str, tail: str) -> str:
    """hreflang x3 + x-default for a /l/... tail such as '/l/' or '/l/<ward>/'."""
    href = {loc: origin + PREFIX[loc] + tail for loc in LOCALES}
    return "".join(
        '<link rel="alternate" hreflang="' + k + '" href="' + escape(v, quote=True) + '">'
        for k, v in (*href.items(), ("x-default", href["vi"]))
    )


def ld_script(data: dict) -> str:
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("<", "\\u003c") + "</script>"


async def active_wards(db: AsyncSession) -> dict:
    return {w.id: w for w in (await db.execute(select(Ward).where(Ward.is_active.is_(True)))).scalars()}


async def active_categories(db: AsyncSession) -> dict:
    return {c.code: c for c in (await db.execute(select(BusinessCategory).where(BusinessCategory.is_active.is_(True)))).scalars()}


async def live_businesses(db: AsyncSession):
    """(active wards by id, active categories by code, all live business rows -- callers filter by ward_id in wards)."""
    return await active_wards(db), await active_categories(db), await list_published_business(db)


async def hub_regions(db: AsyncSession, rows: list) -> list:
    """Wards with at least one live business among `rows` (list_published_business), for the hub's region links: [{'slug', 'names': {locale: name}}]."""
    wards = await active_wards(db)
    used = sorted({wards[s.ward_id] for s, _p, _n in rows if s.ward_id in wards}, key=lambda w: (w.sort_order, w.name_vi))
    return [{"slug": ward_slug(w.code), "names": {loc: ward_name(w, loc) for loc in LOCALES}} for w in used]


async def render_list_for(db: AsyncSession, origin: str, locale: str, slug: str, category: Optional[str]) -> Optional[str]:
    """HTML of /l/<ward>/ or /l/<ward>/<category>/ in `locale`, or None (unknown/inactive ward or category, or no live business)."""
    ward = (
        await db.execute(select(Ward).where(Ward.code == slug.upper().replace("-", "_"), Ward.is_active.is_(True)))
    ).scalar_one_or_none()
    if ward is None or ward_slug(ward.code) != slug:
        return None
    rows = await list_published_business(db, ward.id)
    cats = await active_categories(db)
    cat = None
    if category is not None:
        cat = cats.get(category)
        if cat is None:
            return None
        rows = [r for r in rows if r[0].category_code == category]
    if not rows:
        return None
    entries = [
        {"name": n.facts["name"], "url": origin + "/b/" + s.slug + "/", "address": n.facts["facts"].get("address") or ""}
        for s, _p, n in rows
    ]
    sub = None
    if cat is None:
        counts: dict = {}
        for s, _p, _n in rows:
            if s.category_code in cats:
                counts[s.category_code] = counts.get(s.category_code, 0) + 1
        sub = [(cats[c], n) for c, n in sorted(counts.items(), key=lambda kv: (cats[kv[0]].group_sort_order, cats[kv[0]].sort_order, kv[0]))]
    return render_list(origin, locale, slug, ward_name(ward, locale), cat, entries, sub)


def render_list(origin: str, locale: str, slug: str, ward_label: str, cat: Optional[BusinessCategory], entries: list, sub: Optional[list]) -> str:
    """entries: [{'name', 'url', 'address'}]; sub (ward page only): [(BusinessCategory, count)] for the category links."""
    L = _locale.get(locale)
    T, X = L["TEXTS"], LIST_TEXTS[locale]
    prefix = PREFIX[locale]
    entries = sorted(entries, key=lambda e: (e["name"], e["url"]))
    ward_tail = "/l/" + slug + "/"
    tail = ward_tail if cat is None else ward_tail + cat.code + "/"
    url = origin + prefix + tail
    cat_text = cat_label(cat, locale) if cat is not None else None
    title = X["title_ward"].format(ward=ward_label) if cat is None else X["title_cat"].format(ward=ward_label, cat=cat_text)
    desc = X["desc"].format(title=title, n=len(entries))
    crumbs = [(origin + prefix + "/l/", X["hub"]), (origin + prefix + ward_tail, ward_label)]
    if cat is not None:
        crumbs.append((url, cat_text))
    crumb_html = " › ".join('<a href="' + escape(u, quote=True) + '">' + escape(t) + "</a>" for u, t in crumbs[:-1]) + " › " + escape(crumbs[-1][1])
    items = "".join(
        '<li><a href="' + escape(e["url"], quote=True) + '">' + escape(e["name"]) + "</a>"
        + ("<small>" + escape(e["address"]) + "</small>" if e["address"] else "") + "</li>"
        for e in entries
    )
    body = '<p class="crumbs">' + crumb_html + "</p><p>" + X["count"].format(n=len(entries)) + "</p><ul>" + items + "</ul>"
    if sub:
        body += "<h2>" + X["categories"] + "</h2><ul>" + "".join(
            '<li><a href="' + escape(origin + prefix + ward_tail + c.code + "/", quote=True) + '">' + escape(cat_label(c, locale)) + "</a>"
            + "<small>" + X["count"].format(n=n) + "</small></li>"
            for c, n in sub
        ) + "</ul>"
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage", "name": title, "url": url,
                "isPartOf": {"@type": "CollectionPage", "url": origin + "/l/"},
                "mainEntity": {
                    "@type": "ItemList",
                    "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": e["url"], "name": e["name"]} for i, e in enumerate(entries)],
                },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": t, "item": u} for i, (u, t) in enumerate(crumbs)],
            },
        ],
    }
    return (
        '<!doctype html><html lang="' + L["LANG"] + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<link rel="canonical" href="' + escape(url, quote=True) + '">' + alternate_links(origin, tail)
        + "<title>" + escape(title) + " | " + BRAND + '</title><meta name="description" content="' + escape(desc, quote=True) + '">'
        '<meta property="og:type" content="website"><meta property="og:site_name" content="' + BRAND + '">'
        '<meta property="og:locale" content="' + L["OG_LOCALE"] + '"><meta property="og:title" content="' + escape(title, quote=True) + '">'
        '<meta property="og:url" content="' + escape(url, quote=True) + '"><style>' + PAGE_STYLE + "</style></head><body>"
        '<nav><a href="/">' + BRAND + "</a></nav><main><h1>" + escape(title) + "</h1>" + body + "</main>" + ld_script(graph) + "</body></html>"
    )
