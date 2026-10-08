"""Fact sources -> snapshot dicts {facts, jsonld, source_digest}. No persistence here (publishing.py stores them).

facts   = FactMind `api` shape {entity_id, name, facts{}, fact_details{}} that core.bundle.publication_bundle reads.
jsonld  = slug-free schema.org data; publishing adds url / @id / mainEntityOfPage once the public URL is known.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

from app.models import BusinessCategory, BusinessNews, BusinessPrice, BusinessProfile, Ward
from app.utils import build_imgproxy_url
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from factmind_saigon.core.bundle import menu_items

from .constants import public_origin
from .storage import FmSubject

LOCALES = ("vi", "ko", "en")
NEWS_LIMIT = 5
_SEED = Path(__file__).with_name("platform_facts_seed.json")


def digest_of(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def make_slug(name: str, profile_id) -> str:
    """Name with diacritics stripped + first 8 hex of the id. Callers compute it once (first publish) and never again."""
    base = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    base = base.encode("ascii", "ignore").decode().lower()
    base = re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", base)).strip("-") or "biz"
    return base + "-" + profile_id.hex[:8]


def load_platform_seed() -> dict:
    return json.loads(_SEED.read_text(encoding="utf-8"))


async def business_snapshot(db: AsyncSession, profile: BusinessProfile, locale: str = "vi") -> dict:
    """What the app's public profile API already exposes minus internal ids (owner_user_id, documents, reviews, coupons)."""
    label = None
    if profile.category:
        cat = await db.get(BusinessCategory, profile.category)
        if cat is not None:
            label = getattr(cat, "label_" + locale)
    prices = (
        await db.execute(
            select(BusinessPrice)
            .where(BusinessPrice.profile_id == profile.id)
            .order_by(BusinessPrice.sort_order, BusinessPrice.created_at, BusinessPrice.id)
        )
    ).scalars().all()
    news = (
        await db.execute(
            select(BusinessNews.title)
            .where(BusinessNews.profile_id == profile.id)
            .order_by(BusinessNews.created_at.desc(), BusinessNews.id)
            .limit(NEWS_LIMIT)
        )
    ).scalars().all()
    photo = None
    if profile.photo_content is not None and not profile.photo_content.is_private:
        photo = build_imgproxy_url(profile.photo_content.file_path)
    geo = None
    if profile.latitude is not None and profile.longitude is not None:
        geo = {"latitude": float(profile.latitude), "longitude": float(profile.longitude)}
    menus = [{"name": p.name, "price": p.price_vnd} for p in prices]

    facts = {
        "name": profile.name,
        "category": label,
        "category_code": profile.category,
        "address": profile.address,
        "intro": profile.intro,
        "geo": geo,
        "phone": profile.phone,
        "photo": photo,
        "menus": menus,
        "news": list(news),
    }
    # fact_details only carries keys core.bundle has a page label for (the rendered table); the rest lives in `facts`.
    details = {k: v for k, v in (("category", label), ("intro", profile.intro), ("address", profile.address), ("menus", menus)) if v}
    api = {
        "entity_id": str(profile.id),
        "name": profile.name,
        "facts": {k: v for k, v in facts.items() if v not in (None, "", [])},
        "fact_details": {k: {"typed_value": v} for k, v in details.items()},
    }

    jsonld = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": profile.name}
    if profile.intro:
        jsonld["description"] = profile.intro
    if profile.address:
        jsonld["address"] = {"@type": "PostalAddress", "streetAddress": profile.address, "addressCountry": "VN"}
    if geo:
        jsonld["geo"] = {"@type": "GeoCoordinates", **geo}
    if profile.phone:
        jsonld["telephone"] = profile.phone
    if photo:
        jsonld["image"] = photo
    items = menu_items(menus, locale)
    if items:
        jsonld["hasMenu"] = {"@type": "Menu", "hasMenuItem": items}
    jsonld["isPartOf"] = {"@type": "CollectionPage", "url": public_origin() + "/l/"}
    return {"facts": api, "jsonld": jsonld, "source_digest": digest_of(api)}


# keys added at publish time on top of the operator-edited facts
DYNAMIC_KEYS = ("ward_count", "business_count")


def editable_platform_facts(snapshot_facts: dict) -> dict:
    return {k: v for k, v in snapshot_facts["facts"].items() if k not in DYNAMIC_KEYS}


async def platform_snapshot(db: AsyncSession, facts: dict) -> dict:
    """facts = the operator-edited structure (platform_facts_seed.json shape); live counts are added here."""
    ward_count = (
        await db.execute(select(func.count()).select_from(Ward).where(Ward.is_active == True, Ward.city_code == "HCMC"))
    ).scalar_one()
    business_count = (
        await db.execute(
            select(func.count()).select_from(FmSubject).where(FmSubject.kind == "business", FmSubject.status == "published")
        )
    ).scalar_one()
    api = {
        "entity_id": "platform",
        "name": facts["name"]["vi"],
        "facts": {**facts, "ward_count": ward_count, "business_count": business_count},
        "fact_details": {},
    }
    jsonld = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": facts["name"]["vi"],
        "description": facts["description"]["vi"],
        "url": public_origin() + "/l/",
        "sameAs": list(facts.get("same_as") or []),
    }
    return {"facts": api, "jsonld": jsonld, "source_digest": digest_of(api)}
