"""C5 - publication verification: compare what the public URLs answer with what was stored.

Vendored from FactMind site/self_service.py:176-190 (upstream f6b1772), cut at the persistence seam: the caller
supplies the checks and a reader and stores the returned evidence itself. Stdlib only.
A page passes when: 200 and final_url == url and no noindex/none and canonical == [url] (not for facts.json)
and sha256(stored body) == body_sha256. A list (body None) passes when it links the profile and names it.
"""
from hashlib import sha256
from urllib.parse import urljoin

from . import locale as _locale


def verify_publication(checks, reader, profile_url, name, locale='ko-KR'):
    """checks: [(url, stored body or None, kind)]; reader(url) -> fetch record; profile_url/name: the published
    profile address and name the list must carry. Returns {records, problems, index_status, ai_exposure}."""
    T = _locale.get(locale)['TEXTS']
    records, problems = [], []
    for url, body, kind in checks:
        try: r = reader(url)
        except (ValueError, OSError) as error:
            problems.append({'kind': kind, 'url': url, 'reason': str(error)[:300], 'reason_code': 'read_failed'}); continue
        directives = ','.join(r.get('meta_robots', []) + [r['headers'].get('x-robots-tag', '').lower()]).replace(' ', '').split(',')
        ok = r['http_status'] == 200 and r['final_url'] == url and not any(v in directives for v in ('noindex', 'none'))
        if kind != 'facts': ok = ok and r.get('canonical') == [url]
        if body is not None: ok = ok and r['body_sha256'] == sha256(body.encode()).hexdigest()
        else: ok = ok and profile_url in [urljoin(url, link) for link in r.get('links', [])] and name in r.get('response_text', '')
        records.append({'kind': kind, 'url': url, 'ok': ok, 'http_status': r['http_status'], 'body_sha256': r['body_sha256'], 'observed_at': r['observed_at'], 'reader': r.get('reader', 'public_https')})
        if not ok: problems.append({'kind': kind, 'url': url, 'reason': T['verify_mismatch'], 'reason_code': 'mismatch'})
    return {'records': records, 'problems': problems, 'index_status': 'UNKNOWN', 'ai_exposure': 'NOT_MEASURED'}
