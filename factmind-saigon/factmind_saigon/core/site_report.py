"""C2 - site diagnosis (10 items, robots RFC 9309 matcher, soft-404 probe, before/after comparison).

Vendored from FactMind site/site_report.py:15-16,19-224 (upstream f6b1772). Stdlib only. `reader(url, seconds=...)`
is injected (normally fetch.fetch_public). Item title/problem/fix text comes from the locale (default ko-KR =
upstream text); `bots` and `probe_prefix` default to the upstream values.
"""
import re
import secrets
import time
from urllib.parse import urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET

from . import locale as _locale
from .access import robots_problem, sitemap_problem, SITEMAP_NS
from .fetch import html_facts, visible_text

BOTS = ('Googlebot', 'Yeti', 'Bingbot', 'Daumoa', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot')
REPORT_SECONDS = 45


class SiteRobots:
    """REP groups with longest matching rule, Allow tie-break and * / $ matching.

    The stdlib parser's first matching rule/group can otherwise turn a block into a false pass.
    """
    def parse(self, lines):
        self.groups = []
        agents, rules = [], []
        for line in lines:
            key, sep, value = line.split('#', 1)[0].partition(':')
            key, value = key.strip().lower(), value.strip()
            if not sep: continue
            if key == 'user-agent':
                if rules:
                    self.groups.append((agents, rules)); agents, rules = [], []
                agents.append(value.lower())
            elif key in ('allow', 'disallow') and agents:
                rules.append((key, value))
        if agents: self.groups.append((agents, rules))

    @staticmethod
    def path(value):
        from urllib.parse import quote
        value = quote(value, safe='/%*?$=&:;,+!@()[]~-._')
        return re.sub(r'%[0-9a-fA-F]{2}', lambda m: chr(int(m[0][1:], 16)) if chr(int(m[0][1:], 16)) in
                      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~' else m[0].upper(), value)

    def can_fetch(self, agent, url):
        matches = [(max((len(a) for a in agents if a != '*' and a in agent.lower()), default=0), agents, rules)
                   for agents, rules in self.groups]
        specificity = max((size for size, _, _ in matches), default=0)
        p = urlsplit(url)
        target = self.path((p.path or '/') + ('?' + p.query if p.query else ''))
        found = []
        for size, agents, rules in matches:
            if (specificity and size != specificity) or (not specificity and '*' not in agents): continue
            for key, rule in rules:
                if not rule: continue
                rule = self.path(rule)
                anchor = rule.endswith('$')
                parts = (rule[:-1] if anchor else rule).split('*')
                # Literal searches avoid exponential regex backtracking on untrusted robots rules.
                matched, cursor = target.startswith(parts[0]), len(parts[0])
                for pos, part in enumerate(parts[1:], 1):
                    at = len(target) - len(part) if anchor and pos == len(parts)-1 and target.endswith(part) else target.find(part, cursor)
                    if at < cursor or (anchor and pos == len(parts)-1 and not target.endswith(part)):
                        matched = False
                        break
                    cursor = at + len(part)
                if anchor and len(parts) == 1 and target != parts[0]: matched = False
                if matched:
                    found.append((len(rule.rstrip('$').replace('*', '').encode()), key == 'allow'))
        return max(found)[1] if found else True


def normalized(url):
    p = urlsplit(url)
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path or '/', p.query, ''))


def diagnose_site(url, name, reader, locale='ko-KR', bots=BOTS, probe_prefix='factmind-missing-'):
    """Item title/problem/fix come from the locale; `bots` and `probe_prefix` default to the upstream values."""
    T = _locale.get(locale)['TEXTS']
    until = time.monotonic() + REPORT_SECONDS
    records, items = {}, []

    def read(target):
        target = normalized(target)
        if target in records:
            return records[target]
        left = until - time.monotonic()
        if left <= 0:
            return None
        try:
            result = reader(target, seconds=min(8, left))
        except (OSError, ValueError):
            result = None  # a failed read is never evidence that the site is healthy
        records[target] = result
        return result

    def item(code, title, state, detail='', fix='', urls=()):
        items.append(dict(code=code, title=title, state=state, problem=detail, fix=fix, urls=list(urls)))

    home = read(url)
    opened = bool(home and home['http_status'] == 200)
    item('home_opens', T['home_opens_title'], 'ok' if opened else 'problem' if home else 'skipped',
         T['home_opens_ok'] if opened else T['home_opens_bad'],
         '' if opened else T['home_opens_fix'], [url])
    here = normalized(home.get('final_url', url) if opened else url)
    p = urlsplit(here)
    origin = p.scheme + '://' + p.netloc
    robots_url = origin + '/robots.txt'
    robots = read(robots_url)
    absent = bool(robots and robots['http_status'] in (404, 410))
    # Empty or sitemap-only robots files are valid; a User-agent line is not mandatory.
    rp = robots_problem(robots, locale) if robots and not absent else ''
    if robots and robots['http_status'] == 200 and 'User-agent' in rp:
        rp = ''
    item('robots_file', T['robots_file_title'], 'skipped' if not robots else 'problem' if rp else 'ok',
         rp or (T['robots_file_absent'] if absent else T['robots_file_read']),
         T['robots_file_fix'] if rp else '', [robots_url])
    blocked, rules_known = [], absent
    if robots and not absent and not rp:
        parser = SiteRobots()
        lines = robots.get('response_text', '').splitlines()
        rules_known = True
        parser.parse(lines)
        blocked = [bot for bot in bots if not parser.can_fetch(bot, here)]
    item('robots_allows', T['robots_allows_title'], 'skipped' if not rules_known else 'problem' if blocked else 'ok',
         T['robots_allows_blocked'] % ', '.join(blocked) if blocked else T['robots_allows_ok'],
         T['robots_allows_fix'] if blocked else '', [robots_url, here])

    facts = html_facts(home.get('response_text', '')) if opened else {}
    directives = ' '.join(facts.get('meta_robots', []) + [home.get('headers', {}).get('x-robots-tag', '')] if opened else [])
    excluded = bool(re.search(r'\b(noindex|none)\b', directives, re.I))
    item('no_noindex', T['no_noindex_title'], 'skipped' if not opened else 'problem' if excluded else 'ok',
         T['no_noindex_bad'] if excluded else T['no_noindex_ok'],
         T['no_noindex_fix'] if excluded else '', [here])
    canonicals = [normalized(urljoin(here, value)) for value in facts.get('canonical', [])]
    wrong = any(value != here for value in canonicals)
    item('canonical', T['canonical_title'], 'skipped' if not opened else 'problem' if wrong else 'ok',
         T['canonical_bad'] if wrong else T['canonical_ok'],
         T['canonical_fix'] if wrong else '', [here, *canonicals])

    maps = []
    if robots and not rp and not absent:
        maps = [m.group(1).strip() for line in robots.get('response_text', '').splitlines()
                if (m := re.match(r'\s*sitemap\s*:\s*(\S+)', line, re.I))][:3]
    maps = list(dict.fromkeys([*maps, origin + '/sitemap.xml']))
    locations, map_errors, partial, children = set(), [], False, []
    for target in maps:
        record = read(target)
        if not record:
            partial = True
            continue
        issue = sitemap_problem(record, locale)
        if issue:
            map_errors.append(issue)
            continue
        root = ET.fromstring(record['response_text'])
        values = [e.text.strip() for e in root.findall('.//' + SITEMAP_NS + 'loc') if e.text]
        if root.tag == SITEMAP_NS + 'sitemapindex':
            children.extend(values)
        else:
            locations.update(normalized(value) for value in values)
    children = list(dict.fromkeys(children))
    partial = partial or len(children) > 3
    for target in children[:3]:
        record = read(target)
        if not record or sitemap_problem(record, locale):
            partial = True
            continue
        root = ET.fromstring(record['response_text'])
        if root.tag != SITEMAP_NS + 'urlset':
            partial = True
            continue
        locations.update(normalized(e.text.strip()) for e in root.findall('.//' + SITEMAP_NS + 'loc') if e.text)
    found = here in locations or normalized(url) in locations
    item('sitemap', T['sitemap_title'], 'ok' if found else 'skipped' if partial else 'problem',
         T['sitemap_ok'] if found else T['sitemap_bad'] + ' '.join(dict.fromkeys(map_errors)),
         '' if found else T['sitemap_fix'], maps + children[:3])

    missing_url = origin + '/' + probe_prefix + secrets.token_hex(12)
    missing = read(missing_url)
    missing_status = missing['http_status'] if missing else None
    item('missing_404', T['missing_404_title'], 'ok' if missing_status in (404, 410) else 'problem' if missing_status == 200 else 'skipped',
         T['missing_404_bad'] if missing_status == 200 else T['missing_404_ok'],
         T['missing_404_fix'] if missing_status == 200 else '', [missing_url])
    text, _ = visible_text(home.get('response_text', '')) if opened else ('', '')
    chars = len(text.replace(' ', ''))
    has_name = ' '.join(name.split()).casefold() in text.casefold() if name.strip() else True
    # No invented SEO word-count threshold: show the measured count, flag missing content/name only.
    thin = not text or not has_name
    item('text_in_html', T['text_in_html_title'], 'skipped' if not opened else 'problem' if thin else 'ok',
         T['text_in_html_chars'] % chars + (T['text_in_html_thin'] if thin else T['text_in_html_ok']),
         T['text_in_html_fix'] if thin else '', [here])
    links = list(dict.fromkeys(normalized(urljoin(here, link)) for link in facts.get('links', []) if not link.startswith('#')))
    links = [link for link in links if urlsplit(link).scheme == 'https' and urlsplit(link).netloc == p.netloc and link != here]
    item('links', T['links_title'], 'skipped' if not opened else 'ok' if links else 'problem',
         T['links_ok'] % len(links) if links else T['links_bad'],
         '' if links else T['links_fix'], [here])
    targets = (links or sorted(v for v in locations if urlsplit(v).netloc == p.netloc and v != here))[:3]
    compared, same = [], []
    for target in targets if opened else []:
        record = read(target)
        if record and record['http_status'] == 200:
            compared.append(target)
            other_text, _ = visible_text(record.get('response_text', ''))
            if other_text == text:
                same.append(target)
    item('distinct_pages', T['distinct_pages_title'], 'problem' if same else 'ok' if compared and len(compared) == len(targets) else 'skipped',
         T['distinct_pages_bad'] if same else T['distinct_pages_ok'] % len(compared),
         T['distinct_pages_fix'] if same else '', same or compared)
    return dict(url=url, items=items, reads=[dict(url=target, http_status=r['http_status'], body_sha256=r.get('body_sha256'))
                                           for target, r in records.items() if r], complete_reads=all(records.values()) and time.monotonic() <= until)


def compare_reports(previous, report):
    changes = dict(fixed=[], still=[], new=[])
    if not previous or normalized(previous['url']) != normalized(report['url']):
        return changes
    old = {i['code']: i['state'] for i in previous['items']}
    for item in report['items']:
        code, state = item['code'], item['state']
        if old.get(code) == 'problem' and state == 'ok': changes['fixed'].append(code)
        if old.get(code) == 'problem' and state == 'problem': changes['still'].append(code)
        if old.get(code) == 'ok' and state == 'problem': changes['new'].append(code)
    return changes
