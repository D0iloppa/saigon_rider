"""FactMind core parity check (plan 261008 §3.9 G3).

Runs the golden fixtures (inputs only) through one target and prints digests. The contract is that the overall
digest is identical for `--target saigon` (factmind_saigon.core) and `--target upstream` (FactMind site/*.py):

  python factmind-saigon/tools/fm_parity.py --target saigon
  python factmind-saigon/tools/fm_parity.py --target upstream --path /DEVELOP/Blueurban/factmind/site

Bundles are compared byte for byte (locale='ko-KR'). Diagnoses, access checks, bot verdicts and publication checks
are compared as structure: locale wording keys, saigon-only `reason_code` and non-deterministic fields are dropped
before hashing. Network readers (C1, C6) are not covered. Python 3.8 syntax only; reads nothing outside golden/.
"""
import argparse
import ipaddress
import json
import re
import sys
import textwrap
import types
from datetime import datetime
from hashlib import sha256
from pathlib import Path

sys.dont_write_bytecode = True  # never leave __pycache__ in the upstream checkout

HERE = Path(__file__).resolve().parent
GOLDEN = HERE / 'golden' if (HERE / 'golden').is_dir() else HERE.parent / 'golden'  # next to the script (upstream copy) or one level up (saigon)
DROP = {'title', 'fix', 'problem', 'reason', 'reason_text', 'reason_code', 'reads'}
PROBE = re.compile(r'factmind-missing-[0-9a-f]{24}')


def digest(text):
    return sha256(text.encode('utf-8')).hexdigest()


def clean(value):
    """Structure only: drop locale wording, saigon-only and non-deterministic keys (string `evidence` is locale text)."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in DROP and not (k == 'evidence' and isinstance(v, str))}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    return value


def canon(value):
    return PROBE.sub('PROBE', json.dumps(clean(value), sort_keys=True, ensure_ascii=False, separators=(',', ':')))


def record(url, fields):
    """A fetch record with the defaults the readers produce; a fixture overrides only what matters."""
    if 'error' in fields:
        return dict(fields, url=url)
    text = fields.get('response_text', '')
    base = {'url': url, 'final_url': url, 'http_status': 200, 'headers': {'content-type': 'text/html'}, 'response_text': text,
            'body_sha256': digest(text), 'body_bytes': len(text.encode('utf-8')), 'tls_verified': True, 'meta_robots': [],
            'canonical': [], 'links': [], 'observed_at': '2026-10-01T00:00:00+00:00'}
    base.update(fields)
    return base


class StubResolver:
    def __init__(self, ptr, fwd):
        self.ptr, self.fwd = ptr, fwd

    def reverse(self, ip):
        if self.ptr.get(ip) == 'TIMEOUT':
            raise TimeoutError('dns timeout')
        return list(self.ptr.get(ip, []))

    def forward(self, host):
        return set(self.fwd.get(host, []))


class Saigon:
    def __init__(self, _path):
        sys.path.insert(0, str(HERE.parent))
        from factmind_saigon.core import access, bots, bundle, site_report, verify
        self._bundle, self._access, self._site_report, self._bots, self._verify = bundle, access, site_report, bots, verify

    def publication_bundle(self, s): return self._bundle.publication_bundle(s['snapshot'], s['sid'], s['origin'], s['population'], s['site_control'], s['listing'], locale='ko-KR')
    def list_page(self, *a): return self._bundle.list_page(*a, locale='ko-KR')
    def directory_page(self, *a): return self._bundle.directory_page(*a, locale='ko-KR')
    def rss_feed(self, *a): return self._bundle.rss_feed(*a, locale='ko-KR')
    def diagnose(self, method, url, records): return self._access.diagnose(method, url, records, locale='ko-KR')
    def site_findings(self, records, official, phrases): return self._access.site_findings(records, official, phrases, locale='ko-KR')
    def diagnose_site(self, url, name, reader): return self._site_report.diagnose_site(url, name, reader, locale='ko-KR')
    def bot_ids(self): return {b['id']: b for b in self._bots.default_policy()['bots']}
    def verify_publication(self, checks, reader, profile_url, name): return self._verify.verify_publication(checks, reader, profile_url, name, locale='ko-KR')

    def __getattr__(self, name): return getattr(self._bots, name)


class Upstream:
    # self_service.py publishes verification only inside a Flask route, so the check loop is run from its source text.
    LOOP_START, LOOP_END = 'for url, body, kind in checks:', 'if not ok: problems.append'

    def __init__(self, path):
        sys.path.insert(0, path)
        sys.modules.setdefault('flask', types.SimpleNamespace(jsonify=lambda *a, **k: None))  # site_report imports it for routes only
        import observation_collect
        import public_delivery
        import site_report
        self.pd, self.sr, self.oc = public_delivery, site_report, observation_collect
        lines = (Path(path) / 'self_service.py').read_text(encoding='utf-8').splitlines()
        first = next(i for i, line in enumerate(lines) if self.LOOP_START in line)
        last = next(i for i in range(first, len(lines)) if self.LOOP_END in lines[i])
        body = textwrap.indent(textwrap.dedent('\n'.join(lines[first:last + 1])), '    ')
        scope = {'sha256': sha256, 'urljoin': __import__('urllib.parse', fromlist=['urljoin']).urljoin}
        exec('def run(checks, read, where, name):\n    records, problems = [], []\n' + body + '\n    return records, problems\n', scope)
        self.loop = scope['run']

    def publication_bundle(self, s): return self.pd.publication_bundle(s['snapshot'], s['sid'], s['origin'], s['population'], s['site_control'], s['listing'])
    def list_page(self, *a): return self.pd.list_page(*a)
    def directory_page(self, *a): return self.pd.directory_page(*a)
    def rss_feed(self, *a): return self.pd.rss_feed(*a)
    def diagnose(self, method, url, records): return self.pd.diagnose(method, url, records)
    def site_findings(self, records, official, phrases): return self.pd.site_findings(records, official, phrases)
    def diagnose_site(self, url, name, reader): return self.sr.diagnose_site(url, name, reader)
    def bot_ids(self): return {b['id']: b for b in self.oc.policy()['bots']}
    def classify(self, ua): return self.oc.classify(ua)
    def parse_feed(self, raw): return self.oc.parse_feed(raw)
    def verify(self, *a): return self.oc.verify(*a)
    def client_ip(self, *a): return self.oc.client_ip(*a)
    def referrer_domain(self, referer): return self.oc.referrer_domain(referer)
    def prefetch(self, headers): return self.oc.prefetch(headers)

    def verify_publication(self, checks, reader, profile_url, name):
        records, problems = self.loop(checks, reader, {'profile': profile_url}, name)
        return {'records': records, 'problems': problems}


def fixtures(kind):
    for path in sorted((GOLDEN / kind).glob('*.json')):
        yield kind + '/' + path.stem, json.loads(path.read_text(encoding='utf-8'))


def run_bundle(t, fx):
    files = t.publication_bundle(fx)
    extra = {'list_page': t.list_page('https://factmind.example', fx['list_page']['path'], fx['list_page']['title'], fx['list_page']['entries'], fx['list_page']['population']),
             'directory_page': t.directory_page('https://factmind.example', fx['directory']['lists']),
             'rss_feed': t.rss_feed('https://factmind.example', fx['rss'])}
    return digest(json.dumps(sorted(files.items()) + sorted(extra.items()), ensure_ascii=False))  # byte for byte


def run_diagnosis(t, fx):
    records = {u: record(u, f) for u, f in fx['records'].items()}

    def reader(url, seconds=8):
        if url in records:
            return records[url]
        if '/factmind-missing-' in url:
            return record(url, fx['probe'])
        raise OSError('unreachable')
    return digest(canon(t.diagnose_site(fx['url'], fx['name'], reader)))


def run_access(t, fx):
    records = [record(r['url'], r) for r in fx['records']]
    out = {m: t.diagnose(m, fx['url'], records) for m in fx['methods']}
    out['missing_record'] = t.diagnose('A01', fx['url'] + '/not-read', records)
    out['unsupported'] = [type(e).__name__ for e in [_raises(lambda: t.diagnose('A99', fx['url'], records))]]
    out['findings'] = t.site_findings(records, fx['official'], fx['expected_phrases'])
    return digest(canon(out))


def _raises(fn):
    try:
        fn()
    except Exception as error:  # noqa: BLE001 - only the exception type is compared
        return error
    return None


def run_bots(t, fx):
    ids = t.bot_ids()
    feeds = {}
    for feed_id, raw in fx['feeds'].items():
        cidrs = t.parse_feed(raw)[1]
        feeds[feed_id] = ([ipaddress.ip_network(c) for c in cidrs], digest(raw), 'ok')
    out = {'classify': []}
    for ua in fx['uas']:
        kind, found = t.classify(ua)
        out['classify'].append([kind, found and (found.get('id') or found.get('token'))])
    resolver = StubResolver(fx['rdns']['ptr'], fx['rdns']['fwd'])
    out['verify'] = [t.verify(ids[c['bot']], c['ip'], feeds, resolver) for c in fx['verify']]
    out['feeds'] = {k: [[str(n) for n in v[0]], v[1], v[2]] for k, v in feeds.items()}
    trusted = [ipaddress.ip_network(n) for n in fx['trusted']]
    out['client_ip'] = [t.client_ip(c['remote'], c['headers'], trusted) for c in fx['proxy_cases']]
    out['referrers'] = [t.referrer_domain(r) for r in fx['referers']]
    out['prefetch'] = [t.prefetch(h) for h in fx['prefetch']]
    return digest(canon(out))


def run_verify(t, fx):
    stored = {c['url']: c['body'] for c in fx['checks']}

    def reader(url):
        spec = fx['responses'][url]
        if 'error' in spec:
            raise OSError(spec['error'])
        fields = dict(spec)
        if fields.pop('match_body', False):
            fields['body_sha256'] = digest(stored[url])
        if 'sha' in fields:
            fields['body_sha256'] = fields.pop('sha')
        return record(url, fields)
    checks = [(c['url'], c['body'], c['kind']) for c in fx['checks']]
    result = t.verify_publication(checks, reader, fx['profile_url'], fx['name'])
    return digest(canon({'records': result['records'], 'problems': result['problems']}))


RUNNERS = (('bundle', run_bundle), ('diagnosis', run_diagnosis), ('access', run_access), ('bots', run_bots), ('verify', run_verify))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--target', choices=('saigon', 'upstream'), required=True)
    parser.add_argument('--path', help='upstream: the FactMind site/ directory')
    args = parser.parse_args()
    if args.target == 'upstream' and not args.path:
        parser.error('--target upstream needs --path <factmind>/site')
    target = (Saigon if args.target == 'saigon' else Upstream)(args.path)
    lines = []
    for kind, run in RUNNERS:
        for name, fx in fixtures(kind):
            lines.append('%s %s' % (run(target, fx), name))
            print(lines[-1])
    overall = digest('\n'.join(lines) + '\n')
    print('target: %s' % args.target)
    print('overall digest: %s' % overall)
    print('run id: %s-%s' % (datetime.now().strftime('%Y%m%d'), overall[:8]))


if __name__ == '__main__':
    main()
