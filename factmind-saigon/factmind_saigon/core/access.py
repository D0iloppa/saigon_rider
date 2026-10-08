"""C3 - operator access checks A01-A07 and the "200 that is really an app shell / soft 404" findings.

Vendored from FactMind site/public_delivery.py:146-281 (upstream f6b1772): the robots/sitemap read helpers plus
diagnose and site_findings. Stdlib only. Wording comes from the locale (default ko-KR = upstream text);
diagnose also returns the stable `reason_code`.
"""
from urllib.parse import urlsplit, urljoin
import xml.etree.ElementTree as ET

from . import locale as _locale
from .fetch import visible_text

SITEMAP_NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'


def robots_problem(record, locale='ko-KR'):
    T = _locale.get(locale)['TEXTS']
    content_type = record['headers'].get('content-type', '').lower(); body = record.get('response_text', '')
    if record['http_status'] != 200: return T['robots_status'] % record['http_status']
    if 'html' in content_type or body.lstrip()[:1] == '<': return T['robots_html']
    if 'text/plain' not in content_type: return T['robots_ctype'] % (content_type or T['none'])
    if 'user-agent:' not in body.lower(): return T['robots_no_ua']
    return ''


def sitemap_problem(record, locale='ko-KR'):
    T = _locale.get(locale)['TEXTS']
    content_type = record['headers'].get('content-type', '').lower(); body = record.get('response_text', '')
    if record['http_status'] != 200: return T['sitemap_status'] % record['http_status']
    if 'html' in content_type or '<!DOCTYPE' in body.upper() or '<html' in body[:4096].lower(): return T['sitemap_html']
    if 'xml' not in content_type: return T['sitemap_ctype'] % (content_type or T['none'])
    try: doc = ET.fromstring(body)
    except ET.ParseError: return T['sitemap_parse']
    if doc.tag not in (SITEMAP_NS + 'urlset', SITEMAP_NS + 'sitemapindex'): return T['sitemap_root']
    return ''


def sitemap_document(record):
    if record.get('http_status') != 200 or 'xml' not in record['headers'].get('content-type', '') or '<!DOCTYPE' in record.get('response_text', '').upper(): return None
    try: return ET.fromstring(record['response_text'])
    except ET.ParseError: return None


def sitemap_lists(record, url):
    """True when this read is a urlset that names url."""
    doc = sitemap_document(record)
    return doc is not None and doc.tag == SITEMAP_NS + 'urlset' and url in [(n.text or '').strip() for n in doc.findall('.//' + SITEMAP_NS + 'loc')]


def sitemap_children(record, origin, limit=3):
    """Child sitemap addresses on the same origin when this read is a sitemap index (first `limit`)."""
    doc = sitemap_document(record) if record else None
    if doc is None or doc.tag != SITEMAP_NS + 'sitemapindex': return []
    locs = [(n.text or '').strip() for n in doc.findall('.//' + SITEMAP_NS + 'loc')]
    return [u for u in locs if u.startswith(origin + '/')][:limit]


def diagnose(method, url, records, locale='ko-KR', bots=None):
    """`reason` is locale text, `reason_code` the stable identifier; `bots` defaults to site_report.BOTS."""
    T = _locale.get(locale)['TEXTS']

    def say(code, *args): return T['reason_' + code] % args if args else T['reason_' + code]
    record = next((r for r in records if r['url'] == url), None)
    if record is None: return False, 'BLOCKED', {'reason': say('need_read'), 'reason_code': 'need_read'}
    root = urlsplit(url); origin = root.scheme + '://' + root.netloc
    robots = next((r for r in records if r['url'] == origin + '/robots.txt'), None)
    sitemap = next((r for r in records if r['url'] == origin + '/sitemap.xml'), None)
    missing = next((r for r in records if r.get('probe') == 'missing_page'), None)
    details = {'observed_at': record['observed_at'], 'body_sha256': record['body_sha256'], 'url': url,
               'actual_crawler_visit': False, 'index_status': 'UNKNOWN', 'ai_exposure_inferred': False}
    why, why_code = '', ''
    if method == 'A03': return False, 'BLOCKED', {**details, 'reason': say('a03'), 'reason_code': 'a03'}
    if method == 'A01':
        ok = record['http_status'] == 200 and record['tls_verified'] and bool(record.get('response_text', '').strip() or record.get('body_bytes', 0))
        # T_ 2026-10-05 취향판본: a 200 that a made-up path also gets is the app screen every address returns, not this page.
        if ok and missing and missing['http_status'] == 200 and missing['body_sha256'] == record['body_sha256'] and (root.path or '/') != '/':
            ok = False; why, why_code = say('same_as_missing'), 'same_as_missing'
    elif method == 'A02':
        if not robots: return False, 'BLOCKED', {**details, 'reason': say('need_robots'), 'reason_code': 'need_robots'}
        valid = robots['http_status'] == 200 and 'text/plain' in robots['headers'].get('content-type', '').lower() and 'user-agent:' in robots.get('response_text', '').lower()
        # T_ 2026-10-06: the owner report's RFC 9309 matcher and search bots, not the stdlib first-match parser for Googlebot alone.
        from .site_report import BOTS, SiteRobots  # imported here: site_report imports this module
        BOTS = BOTS if bots is None else tuple(bots)
        parser = SiteRobots(); parser.parse(robots.get('response_text', '').splitlines())
        blocked = [bot for bot in BOTS if not parser.can_fetch(bot, url)]
        ok = valid and not blocked
        details['policy_scope'] = 'robots directives for ' + ', '.join(BOTS) + '; no actual crawler visit'
        if not ok:
            why = robots_problem(robots, locale)
            if why: why_code = 'robots_invalid'
            else: why, why_code = say('robots_blocks_bots', ', '.join(blocked)), 'robots_blocks_bots'
    elif method == 'A04':
        directives = ','.join(record['meta_robots']) + ',' + record['headers'].get('x-robots-tag', '').lower()
        ok = record['http_status'] == 200 and not any(v in directives.replace(' ', '').split(',') for v in ('noindex', 'none', 'nosnippet'))
    elif method == 'A05': ok = record['canonical'] == [record['final_url']] and record['http_status'] == 200
    elif method == 'A06':
        # T_ 2026-10-05 취향판본: '#contact' resolves to this same document, so it is not a link a crawler can follow elsewhere.
        here = record['final_url'].split('#')[0]
        targets = [urljoin(record['final_url'], v).split('#')[0] for v in record.get('links', [])]
        ok = any(urlsplit(t).netloc == root.netloc and t != here for t in targets)
        if not ok and targets: why, why_code = say('no_other_links', sum(t == here for t in targets)), 'no_other_links'
    elif method == 'A07':
        if not sitemap: return False, 'BLOCKED', {**details, 'reason': say('need_sitemap'), 'reason_code': 'need_sitemap'}
        ok, unread = sitemap_lists(sitemap, record['final_url']), []
        if not ok and sitemap_children(sitemap, origin):
            # T_ 2026-10-06: the root may be a sitemap index (FactMind's own is); look in the child sitemaps that were read.
            children = sitemap_children(sitemap, origin)
            unread = [c for c in children if not any(r['url'] == c for r in records)]
            ok = any(sitemap_lists(r, record['final_url']) for r in records if r['url'] in children)
        if not ok:
            why = sitemap_problem(sitemap, locale)
            if why: why_code = 'sitemap_invalid'
            elif unread and len(unread) == len(sitemap_children(sitemap, origin)): why, why_code = say('sitemap_children_unread', ', '.join(unread)), 'sitemap_children_unread'
            else: why, why_code = say('not_in_sitemap'), 'not_in_sitemap'
    else: raise ValueError('unsupported_method')
    if ok: why, why_code = say('ok'), 'ok'
    elif not why: why, why_code = say('condition_unmet', method), 'condition_unmet'
    return bool(ok), 'VERIFIED' if ok else 'FAILED', {**details, 'reason': why, 'reason_code': why_code}


def site_findings(records, official, expected_phrases=(), locale='ko-KR'):
    """T_ 2026-10-05 취향판본: what a 200-only read calls healthy — fallback files, one screen for many addresses, text only scripts draw.
    A read of public responses; never a crawler visit, an index state or an AI exposure."""
    T = _locale.get(locale)['TEXTS']
    p = urlsplit(official); origin = p.scheme + '://' + p.netloc
    read = [r for r in records if 'error' not in r]
    by_url = {r['url']: r for r in read}
    findings = []
    robots = by_url.get(origin + '/robots.txt')
    if robots and robots['http_status'] == 200 and robots_problem(robots, locale):
        findings.append({'code': 'robots_not_robots_file', 'urls': [robots['url']], 'evidence': robots_problem(robots, locale),
                         'fix': T['finding_robots_fix']})
    sitemap = by_url.get(origin + '/sitemap.xml')
    if sitemap and sitemap['http_status'] == 200 and sitemap_problem(sitemap, locale):
        findings.append({'code': 'sitemap_not_xml', 'urls': [sitemap['url']], 'evidence': sitemap_problem(sitemap, locale),
                         'fix': T['finding_sitemap_fix']})
    missing = next((r for r in read if r.get('probe') == 'missing_page'), None)
    if missing and missing['http_status'] == 200:
        findings.append({'code': 'missing_page_answers_200', 'urls': [missing['url']], 'evidence': T['finding_missing_evidence'],
                         'fix': T['finding_missing_fix']})
    groups = {}
    for r in read:
        groups.setdefault(r['body_sha256'], {})[urlsplit(r['final_url'])._replace(fragment='').geturl()] = r['url']
    for digest, urls in groups.items():
        if len(urls) > 1:
            findings.append({'code': 'same_document_for_different_urls', 'urls': sorted(urls.values()), 'evidence': T['finding_same_evidence'] % (len(urls), digest[:16]),
                             'fix': T['finding_same_fix']})
    page = by_url.get(official)
    initial = None
    if page and page['http_status'] == 200:
        body, noscript = visible_text(page.get('response_text', ''))
        here = page['final_url'].split('#')[0]
        targets = [urljoin(page['final_url'], v).split('#')[0] for v in page.get('links', [])]
        other_pages = sorted({t for t in targets if urlsplit(t).netloc == urlsplit(here).netloc and t != here})
        if not other_pages:
            findings.append({'code': 'no_links_to_other_pages', 'urls': [official], 'evidence': T['finding_links_evidence'] % sum(t == here for t in targets),
                             'fix': T['finding_links_fix']})
        folded = body.casefold()
        absent = [v for v in expected_phrases if ' '.join(v.split()).casefold() not in folded]
        if absent:
            findings.append({'code': 'phrases_missing_from_initial_html', 'urls': [official], 'evidence': {'missing': absent, 'checked': len(expected_phrases)},
                             'fix': T['finding_phrases_fix']})
        initial = {'url': official, 'visible_chars': len(body.replace(' ', '')), 'noscript_text': noscript[:300], 'phrases_checked': len(expected_phrases), 'links_to_other_pages': len(other_pages)}
    return {'findings': findings, 'initial_html': initial, 'actual_crawler_visit': False, 'index_status': 'UNKNOWN', 'ai_exposure_inferred': False}
