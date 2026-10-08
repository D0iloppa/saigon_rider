"""Locale data for core: one module per locale, each a flat TEXTS dict plus a few market constants.

get('ko-KR') is the upstream FactMind wording and the default of every core function.
"""
from . import en, ko, vi

_LOCALES = {'ko-KR': ko, 'ko': ko, 'vi-VN': vi, 'vi': vi, 'en': en}


def get(locale):
    """Return the locale module (TEXTS, LANG, OG_LOCALE, COUNTRY, CURRENCY, CLOSED_DAYS, CLOSED_NONE, PROVINCES) as a dict."""
    module = _LOCALES[locale]
    return {name: getattr(module, name) for name in ('TEXTS', 'LANG', 'OG_LOCALE', 'COUNTRY', 'CURRENCY', 'CLOSED_DAYS', 'CLOSED_NONE', 'PROVINCES')}
