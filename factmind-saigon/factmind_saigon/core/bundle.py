"""C4 - bundle generator: approved snapshot -> {path: body} (profile HTML, facts.json, JSON-LD, lists, directory, RSS,
robots.txt, sitemap.xml). Fixed templates, no generated wording.

Vendored from FactMind site/public_delivery.py:284-349,372-521 (upstream f6b1772). Stdlib only. Every market-specific
value (page text, lang, og:locale, addressCountry, priceCurrency, weekday names, brand) comes from core.locale; with
the default locale='ko-KR' the output equals upstream byte for byte.
"""
from datetime import datetime
from html import escape
import json
import re
from urllib.parse import urlsplit, quote

from . import locale as _locale

def discovery_files(urls, locale='ko-KR'):
    if not urls: raise ValueError(_locale.get(locale)['TEXTS']['err_urls'])
    origin = 'https://' + urlsplit(next(iter(urls))).netloc
    rows = ''.join('<url><loc>' + escape(url) + '</loc>' + ('<lastmod>' + escape(modified) + '</lastmod>' if modified else '') + '</url>' for url, modified in sorted(urls.items()))
    return {'robots.txt': 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ' + origin + '/sitemap.xml\n',
            'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + rows + '</urlset>\n'}


PAGE_STYLE = 'body{margin:0;background:#f6f7fa;color:#192335;font:16px/1.8 system-ui,sans-serif}nav,main{max-width:880px;margin:auto;padding:28px}nav a{font-size:24px;font-weight:750}main{background:white;border:1px solid #e3e7ef;border-radius:16px}h1{line-height:1.4;overflow-wrap:anywhere}a{color:#2854e8;overflow-wrap:anywhere}li{margin:10px 0}small{display:block;color:#647086}main>p{color:#647086}@media(max-width:600px){nav,main{padding:20px}main{margin:0 12px}h1{font-size:26px}}'


def list_page(origin, path, title, entries, population=None, locale='ko-KR'):
    """FactMind public list (homepage/06 §2): registered shops by name; surveyed non-customers only with criteria and date."""
    L = _locale.get(locale); T = L['TEXTS']
    origin = origin.rstrip('/'); address = origin + '/' + path
    items = ''.join('<li><a href="' + escape(e['url'], quote=True) + '">' + escape(e['name']) + '</a><small>' + T['list_item_note'] + escape(e['updated'][:10]) + '</small></li>'
                    for e in sorted(entries, key=lambda e: (e['name'], e['url'])))
    body = '<h2>' + T['list_h2_registered'] + '</h2><ul>' + (items or '<li>' + T['list_empty'] + '</li>') + '</ul>'
    if population:
        members = ''.join('<li><a href="' + escape(m['source_url'], quote=True) + '">' + escape(m['name']) + '</a></li>' for m in population['members'])
        body += ('<h2>' + T['surveyed_h2'] + '</h2><p>' + T['criteria_label'] + escape(population['criteria']) + '</p><p>' + T['researched_label'] + escape(population['researched_at'])
                 + '</p><p>' + T['omissions_label'] + escape(population['known_omissions']) + '</p><ul>' + members + '</ul>')
    else:
        body += '<p>' + T['list_only_registered'] + '</p>'
    body += '<p>' + T['list_order_note'] + '<a href="' + escape(origin + '/#contact', quote=True) + '">' + T['correct_report'] + '</a>' + T['correct_post'] + '</p>'
    data = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'url': address, 'name': title,
            'mainEntity': {'@type': 'ItemList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': e['url'], 'name': e['name']}
                                                                   for i, e in enumerate(sorted(entries, key=lambda e: (e['name'], e['url'])))]}}
    return ('<!doctype html><html lang="' + L['LANG'] + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="'
            + escape(address, quote=True) + '"><title>' + escape(title) + ' | ' + T['brand'] + '</title><meta name="description" content="'
            + escape(title + T['list_description_tail'], quote=True) + '"><style>' + PAGE_STYLE + '</style></head><body><nav><a href="/">' + T['brand'] + '</a></nav><main><h1>'
            + escape(title) + '</h1>' + body + '</main><script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + '</script></body></html>')


def directory_page(origin, lists, locale='ko-KR'):
    """T_ 2026-10-06 대표님 핵심(우리가 게시한 정보가 수집되게): the crawlable path from the homepage footer to every public list and
    profile, which had no link from anywhere (sitemaps only). lists: [{'url', 'title', 'entries': [{'name', 'url'}]}]"""
    L = _locale.get(locale); T = L['TEXTS']
    origin = origin.rstrip('/'); address = origin + '/lists/'; lists = sorted(lists, key=lambda l: l['title'])
    title = T['directory_title']
    sections = ''.join('<section><h2><a href="' + escape(l['url'], quote=True) + '">' + escape(l['title']) + '</a></h2><ul>'
                       + ''.join('<li><a href="' + escape(e['url'], quote=True) + '">' + escape(e['name']) + '</a></li>' for e in sorted(l['entries'], key=lambda e: (e['name'], e['url'])))
                       + '</ul></section>' for l in lists)
    body = ('<p>' + T['directory_intro'] + '</p>'
            + (sections or '<p>' + T['directory_empty'] + '</p>'))
    data = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'url': address, 'name': title,
            'mainEntity': {'@type': 'ItemList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': l['url'], 'name': l['title']} for i, l in enumerate(lists)]}}
    return ('<!doctype html><html lang="' + L['LANG'] + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="'
            + escape(address, quote=True) + '"><link rel="alternate" type="application/rss+xml" title="' + T['rss_title'] + '" href="' + escape(origin + '/profiles/rss.xml', quote=True)
            + '"><title>' + escape(title) + ' | ' + T['brand'] + '</title><meta name="description" content="' + escape(T['directory_description'], quote=True)
            + '"><style>' + PAGE_STYLE + '</style></head><body><nav><a href="/">' + T['brand'] + '</a></nav><main><h1>' + escape(title) + '</h1>' + body
            + '</main><script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + '</script></body></html>')


def rss_feed(origin, items, locale='ko-KR'):
    """T_ 2026-10-06: RSS 2.0 of public profiles — Naver Search Advisor collects submitted RSS, a path its crawler has not taken from our
    sitemaps. items: [{'title', 'url', 'published', 'description'}], newest first."""
    from email.utils import format_datetime
    L = _locale.get(locale); T = L['TEXTS']
    origin = origin.rstrip('/')

    def when(value):
        try: return format_datetime(datetime.fromisoformat(str(value).replace('Z', '+00:00')))
        except ValueError: return ''
    rows = ''.join('<item><title>' + escape(i['title']) + '</title><link>' + escape(i['url']) + '</link><guid isPermaLink="true">' + escape(i['url']) + '</guid>'
                   + ('<pubDate>' + when(i['published']) + '</pubDate>' if when(i['published']) else '') + '<description>' + escape(i.get('description') or '') + '</description></item>'
                   for i in sorted(items, key=lambda i: str(i['published']), reverse=True))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>' + T['rss_title'] + '</title><link>' + escape(origin + '/lists/')
            + '</link><description>' + T['rss_description'] + '</description><language>' + L['LANG'] + '</language>' + rows + '</channel></rss>\n')


SPAN = re.compile(r'([01]\d|2[0-3]):([0-5]\d)\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d)')


def plain_facts(api):
    """Approved facts without conditions, as their typed values."""
    out = {}
    for key, value in api.get('fact_details', {}).items():
        detail = value if isinstance(value, dict) and 'typed_value' in value else {'typed_value': value}
        if not detail.get('conditions') and not detail.get('unit') and detail['typed_value'] not in (None, '', [], {}):
            out[key] = detail['typed_value']
    return out


def opening_hours(hours, locale='ko-KR'):
    """schema.org hours only when every part reads unambiguously; anything else stays as the owner's text."""
    L = _locale.get(locale); CLOSED_DAYS = L['CLOSED_DAYS']
    if not isinstance(hours, dict): return None
    closed = str(hours.get('closed') or '').strip()
    if closed not in ('', L['CLOSED_NONE'], *CLOSED_DAYS): return None
    specs, pause = [], str(hours.get('breakTime') or '').strip()
    for key, days in (('weekday', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']), ('weekend', ['Saturday', 'Sunday'])):
        m = SPAN.fullmatch(str(hours.get(key) or '').strip())
        if not m: return None
        opens, closes = m[1] + ':' + m[2], m[3] + ':' + m[4]
        periods = [(opens, closes)]
        if pause:
            b = SPAN.fullmatch(pause)
            if not b or not opens < b[1] + ':' + b[2] < b[3] + ':' + b[4] < closes: return None
            periods = [(opens, b[1] + ':' + b[2]), (b[3] + ':' + b[4], closes)]
        if not opens < closes: return None
        days = [d for d in days if d != CLOSED_DAYS.get(closed)]
        specs += [{'@type': 'OpeningHoursSpecification', 'dayOfWeek': days, 'opens': a, 'closes': z} for a, z in periods]
    return specs


def menu_items(menus, locale='ko-KR'):
    currency = _locale.get(locale)['CURRENCY']
    if not isinstance(menus, list): return []
    return [{'@type': 'MenuItem', 'name': m['name'], **({'offers': {'@type': 'Offer', 'price': m['price'], 'priceCurrency': currency}}
                                                          if type(m.get('price')) in (int, float) else {})}
            for m in menus if isinstance(m, dict) and isinstance(m.get('name'), str) and m['name'].strip()]


def public_schema(snapshot, url, locale='ko-KR'):
    L = _locale.get(locale)
    api, internal = snapshot['api'], snapshot.get('jsonld') or {}
    plain, kind = plain_facts(api), internal.get('@type') or 'Thing'
    data = {'@context': 'https://schema.org', '@type': kind, '@id': url + '#entity', 'mainEntityOfPage': url, 'name': api['name']}
    if isinstance(plain.get('intro'), str): data['description'] = plain['intro']
    if isinstance(plain.get('url'), str) and plain['url'].startswith(('https://', 'http://')): data['url'] = plain['url']
    same = [u for u in internal.get('sameAs', []) if isinstance(u, str) and u.startswith(('https://', 'http://'))]
    if same: data['sameAs'] = same
    if kind == 'WebApplication':
        if isinstance(plain.get('category'), str): data['applicationCategory'] = plain['category']
        features = [f for f in plain.get('features', []) if isinstance(f, str)] if isinstance(plain.get('features'), list) else []
        if features: data['featureList'] = features
    if kind == 'LocalBusiness':
        if isinstance(plain.get('address'), str): data['address'] = {'@type': 'PostalAddress', 'streetAddress': plain['address'], 'addressCountry': L['COUNTRY']}
        hours = opening_hours(plain.get('hours'), locale)
        if hours: data['openingHoursSpecification'] = hours
        items = menu_items(plain.get('menus'), locale)
        if items: data['hasMenu'] = {'@type': 'Menu', 'hasMenuItem': items}
        geo = plain.get('geo')
        if isinstance(geo, dict) and all(type(geo.get(k)) in (int, float) for k in ('latitude', 'longitude')):
            data['geo'] = {'@type': 'GeoCoordinates', 'latitude': geo['latitude'], 'longitude': geo['longitude']}
    return data


def questions(name, plain, locale='ko-KR'):
    T = _locale.get(locale)['TEXTS']
    """Fixed questions a customer would ask, answered only by the approved value (no particle guessing after names)."""
    def won(price): return format(price, ',') + T['currency_suffix'] if type(price) in (int, float) else ''
    qa = []
    if isinstance(plain.get('category'), str): qa.append((T['q_category'] % name, T['a_category'] % escape(plain['category'])))
    if isinstance(plain.get('address'), str): qa.append((T['q_address'] % name, escape(plain['address'])))
    hours = plain.get('hours')
    if isinstance(hours, dict):
        parts = [(label, str(hours.get(key) or '').strip()) for key, label in (('weekday', T['hours_weekday']), ('weekend', T['hours_weekend']), ('closed', T['hours_closed']), ('breakTime', T['hours_break']))]
        if any(v for _, v in parts): qa.append((T['q_hours'] % name, escape(' · '.join(label + ' ' + v for label, v in parts if v))))
    items = [m for m in plain.get('menus', []) if isinstance(m, dict) and isinstance(m.get('name'), str)] if isinstance(plain.get('menus'), list) else []
    if items: qa.append((T['q_menu'] % name, escape(' · '.join((m['name'] + ' ' + won(m.get('price'))).strip() for m in items))))
    features = [f for f in plain.get('features', []) if isinstance(f, str)] if isinstance(plain.get('features'), list) else []
    if features: qa.append((T['q_features'] % name, escape(' · '.join(features))))
    if isinstance(plain.get('url'), str) and plain['url'].startswith(('https://', 'http://')):
        qa.append((T['q_url'] % name, '<a href="' + escape(plain['url'], quote=True) + '">' + escape(plain['url']) + '</a>'))
    return [(escape(q), a) for q, a in qa]


def publication_bundle(snapshot, sid, origin, population=None, site_control=None, listing=None, locale='ko-KR'):
    L = _locale.get(locale); T = L['TEXTS']
    p = urlsplit(origin)
    if p.scheme != 'https' or not p.hostname or p.path not in ('', '/') or p.username or p.query or p.fragment or p.port not in (None, 443):
        raise ValueError(T['err_origin'])
    origin = origin.rstrip('/')
    path = 'profiles/' + quote(sid, safe='') + '/index.html'
    url = origin + '/' + path[:-10]
    api = snapshot['api']; schema = public_schema(snapshot, url, locale); plain = plain_facts(api)
    labels={k:T['label_'+k] for k in ('name','intro','url','category','address','menus','hours','weekday','weekend','closed','breakTime','features','price')}
    def readable(value):
        if value is None:return T['unknown']
        if isinstance(value,dict) and isinstance(value.get('name'),str) and set(value)<={'name','price'}:  # a menu item reads as '칼국수 9,000원' (ko)
            return (value['name']+(' '+format(value['price'],',')+T['currency_suffix'] if type(value.get('price')) in (int,float) else '')).strip()
        if isinstance(value,list):return ' · '.join(readable(v) for v in value)
        if isinstance(value,dict):return ' · '.join(labels.get(k,k)+': '+readable(v) for k,v in value.items())
        return str(value)
    facts=''
    for key,value in api['fact_details'].items():
        detail=value if isinstance(value,dict) and 'typed_value' in value else {'typed_value':value}
        display=readable(detail['typed_value'])+(' '+detail['unit'] if detail.get('unit') else '')
        condition='<small>'+T['condition_label']+escape(readable(detail['conditions']))+'</small>' if detail.get('conditions') else ''
        facts+='<tr><th scope="row">'+escape(labels.get(key,key))+'</th><td>'+escape(display)+condition+'</td></tr>'
    def page(title, address, content, data, description='', heading=None):
        style='body{margin:0;background:#f6f7fa;color:#192335;font:16px/1.8 system-ui,sans-serif}nav,main{max-width:880px;margin:auto;padding:28px}nav a{font-size:24px;font-weight:750}main{background:white;border:1px solid #e3e7ef;border-radius:16px}h1{line-height:1.4;overflow-wrap:anywhere}h2{font-size:20px;margin:32px 0 8px}a{color:#2854e8;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:28px 0}th,td{text-align:left;vertical-align:top;padding:18px 8px;border-bottom:1px solid #e3e7ef;overflow-wrap:anywhere}th{width:25%;color:#647086}dt{font-weight:700;margin-top:16px}dd{margin:2px 0 0;overflow-wrap:anywhere}small{display:block;color:#647086}main>p{color:#647086}main>p.lead,main>p.intro{color:#192335}main>p.lead{font-weight:650}@media(max-width:600px){nav,main{padding:20px}main{margin:0 12px}h1{font-size:26px}th,td{font-size:14px;padding:14px 6px}}'
        meta = ('<meta name="description" content="' + escape(description, quote=True) + '"><meta property="og:description" content="' + escape(description, quote=True) + '">' if description else '')
        meta += ('<meta property="og:type" content="website"><meta property="og:site_name" content="'+T['brand']+'"><meta property="og:locale" content="'+L['OG_LOCALE']+'"><meta property="og:title" content="'
                 + escape(title, quote=True) + '"><meta property="og:url" content="' + escape(address, quote=True) + '">')
        return '<!doctype html><html lang="'+L['LANG']+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="' + escape(address, quote=True) + '"><title>' + escape(title) + ' | '+T['brand']+'</title>' + meta + '<style>'+style+'</style></head><body><nav><a href="/">'+T['brand']+'</a></nav><main><h1>' + escape(heading or title) + '</h1>' + content + '</main><script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + '</script></body></html>'
    # Provenance (security requirement §7): customer-provided, target site, last edit date, correction/report path.
    notice = '<p>' + T['notice_provided'] + escape(snapshot['lastmod'][:10]) + '</p>'
    if site_control and site_control.get('kind') == 'business_check':
        # T_ V0_6 §2-6: a shop's proof states exactly what was compared, never an official or truth certification.
        notice += '<p>' + T['notice_business_check'] % escape(site_control['verified_on']) + '</p>'
    elif site_control:
        notice += '<p>' + T['notice_site_control'] % (escape(site_control['host']), escape(site_control['method']), escape(site_control['verified_on'])) + '</p>'
    if listing:  # T_ 2026-10-06 week 1 (from the comparison hub branch): the profile links the public list it joins (url, title)
        notice += '<p>' + T['notice_listing'] + '<a href="' + escape(listing[0], quote=True) + '">' + escape(listing[1]) + '</a></p>'
    notice += '<p>' + T['notice_correct'] + '<a href="' + escape(origin + '/#contact', quote=True) + '">' + T['correct_report'] + '</a>' + T['notice_correct_post'] + '</p>'
    category = plain['category'] if isinstance(plain.get('category'), str) else ''
    intro = plain['intro'] if isinstance(plain.get('intro'), str) else ''
    title = api['name'] + (' — ' + category if category else '')
    lead = ('<p class="lead">' + escape(category) + '</p>' if category else '') + ('<p class="intro">' + escape(intro) + '</p>' if intro else '')
    qa = questions(api['name'], plain, locale)
    faq = '<h2>' + T['faq_h2'] + '</h2><dl>' + ''.join('<dt>' + q + '</dt><dd>' + a + '</dd>' for q, a in qa) + '</dl>' if qa else ''
    description = (intro or title + T['default_description_tail'])[:160]
    files = {path: page(title, url, lead + faq + '<h2>' + T['facts_h2'] + '</h2><table><tbody>' + facts + '</tbody></table>' + notice, schema, description, api['name']),
             'profiles/' + quote(sid, safe='') + '/facts.json': json.dumps(api, ensure_ascii=False, indent=2)}
    urls = {url: snapshot['lastmod']}
    if population and population.get('source') != 'NONE':
        if not population.get('criteria') or not population.get('researched_at') or len(population.get('members', [])) < 2: raise ValueError(T['err_population'])
        members = []
        seen = set()
        for member in population['members']:
            name = member.get('name'); source = member.get('source_url')
            if not isinstance(name, str) or not name.strip() or not isinstance(source, str) or urlsplit(source).scheme != 'https' or not urlsplit(source).hostname or urlsplit(source).username or source in seen:
                raise ValueError(T['err_member'])
            seen.add(source); members.append('<li><a href="' + escape(source, quote=True) + '">' + escape(name) + '</a></li>')
        address = origin + '/directories/' + quote(sid, safe='') + '/'
        text = '<p>' + T['criteria_label'] + escape(population['criteria']) + '</p><p>' + T['researched_label'] + escape(population['researched_at']) + '</p><p>' + T['omissions_label'] + escape(population.get('known_omissions') or T['unknown']) + '</p><ul>' + ''.join(members) + '</ul>'
        files['directories/' + quote(sid, safe='') + '/index.html'] = page(T['directory_page_title'], address, text, {'@context': 'https://schema.org', '@type': 'CollectionPage', 'url': address})
        urls[address] = snapshot['lastmod']
    files.update(discovery_files(urls, locale))
    return files
