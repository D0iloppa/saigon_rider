"""C7 - bot visit verification core: a user agent only nominates a bot; it becomes VERIFIED by the provider's
official IP feed or by reverse DNS with a forward re-check. An untrusted X-Forwarded-For is ignored.

Vendored from FactMind site/observation_collect.py:58-206 (upstream f6b1772), minus the SQLite-coupled
refresh_feeds/valid_feeds/record (adapter work) and the FactMind path table. Stdlib only. The policy is data:
`default_policy()` loads bot_policy_upstream.json (upstream observation_policy.json, byte for byte) and
`load_policy(VN_POLICY)` loads bot_policy.json (Saigon market: Yeti/Daum removed). Every function that needs a
policy takes it as an argument and defaults to the upstream one.
"""
from functools import lru_cache
import ipaddress
import json
from pathlib import Path
import re
import socket
import threading

ROOT = Path(__file__).resolve().parent
UPSTREAM_POLICY = ROOT / 'bot_policy_upstream.json'
VN_POLICY = ROOT / 'bot_policy.json'


def load_policy(path=UPSTREAM_POLICY):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    for bot in data['bots']: bot['pattern'] = re.compile(re.escape(bot['ua']), re.IGNORECASE)
    data['excluded'] = [(re.compile(re.escape(t['token']), re.IGNORECASE), t) for t in data['excluded_tokens']]
    return data


@lru_cache(maxsize=1)
def default_policy():
    return load_policy(UPSTREAM_POLICY)


def classify(ua, policy=None):
    """→ ('bot', bot) | ('excluded', token) | (None, None). Google-Extended is a robots token, never a visitor."""
    ua, policy = ua or '', policy or default_policy()
    for pattern, token in policy['excluded']:
        if pattern.search(ua): return 'excluded', token
    for bot in policy['bots']:
        if bot['pattern'].search(ua): return 'bot', bot
    return None, None


def parse_feed(raw):
    """A provider feed: {"creationTime", "prefixes": [{"ipv4Prefix"|"ipv6Prefix": CIDR}]}. Anything else is rejected."""
    data = json.loads(raw.decode('utf-8-sig') if isinstance(raw, bytes) else raw)
    prefixes = data.get('prefixes') if isinstance(data, dict) else None
    if not isinstance(prefixes, list) or not prefixes: raise ValueError('feed has no prefixes')
    cidrs = []
    for p in prefixes:
        values = [v for k, v in (p.items() if isinstance(p, dict) else []) if k in ('ipv4Prefix', 'ipv6Prefix')]
        if len(values) != 1: raise ValueError('feed prefix entry is malformed')
        cidrs.append(str(ipaddress.ip_network(values[0], strict=False)))
    return str(data.get('creationTime') or ''), cidrs


def max_age(headers):
    m = re.search(r'max-age=(\d+)', (headers or {}).get('cache-control', ''))
    return int(m.group(1)) if m else None



class Resolver:
    """System DNS with a hard time limit; a lookup failure is UNKNOWN, never a pass."""
    def __init__(self, seconds=2.0): self.seconds = seconds

    def _timed(self, fn, *args):
        box = {}
        def run():
            try: box['value'] = fn(*args)
            except OSError as error: box['error'] = error
        worker = threading.Thread(target=run, daemon=True); worker.start(); worker.join(self.seconds)
        if worker.is_alive(): raise TimeoutError('dns timeout')
        if 'error' in box: raise box['error']
        return box['value']

    def reverse(self, ip):
        try: host, aliases, _ = self._timed(socket.gethostbyaddr, ip)
        except (socket.herror, socket.gaierror): return []  # no PTR: evidence that the name does not match
        return [host] + list(aliases)

    def forward(self, host):
        try: return {info[4][0] for info in self._timed(socket.getaddrinfo, host, None)}
        except socket.gaierror: return set()


def host_allowed(host, suffixes):
    host = host.lower().rstrip('.')
    return any(host == s or host.endswith('.' + s) for s in suffixes)  # a dot boundary: no example.com.evil.test


def rdns_verify(ip, suffixes, resolver):
    try:
        for host in resolver.reverse(ip):
            if host_allowed(host, suffixes):
                if any(ipaddress.ip_address(a) == ipaddress.ip_address(ip) for a in resolver.forward(host.rstrip('.'))):
                    return 'VERIFIED', 'reverse_dns', host.lower().rstrip('.')
                return 'UNVERIFIED', 'rdns_forward_mismatch', ''
        return 'UNVERIFIED', 'rdns_name_mismatch', ''
    except (TimeoutError, OSError, ValueError):
        return 'UNKNOWN', 'dns_unavailable', ''


def verify(bot, ip, feeds, resolver):
    """→ (verdict, reason, method, evidence). UNVERIFIED = valid evidence disagrees; UNKNOWN = no evidence obtained."""
    if not bot.get('enabled'): return 'UNKNOWN', bot.get('disabled_reason', 'unsupported_bot'), '', ''
    if not ip: return 'UNKNOWN', 'client_ip_untrusted', '', ''
    address, seen = ipaddress.ip_address(ip), []
    for feed_id in bot['feeds']:
        if feed_id not in feeds: seen.append(('UNKNOWN', 'feed_unavailable')); continue
        networks, digest, refreshed = feeds[feed_id]
        if any(address in n for n in networks):
            return 'VERIFIED', '', 'ip_feed', feed_id + ':' + digest[:16] + (':' + refreshed if refreshed != 'ok' else '')
        seen.append(('UNVERIFIED', 'ip_outside_feed'))
    if bot['rdns']:
        verdict, reason, host = rdns_verify(ip, bot['rdns'], resolver)
        if verdict == 'VERIFIED': return verdict, '', 'reverse_dns', host
        seen.append((verdict, reason))
    bad = [r for v, r in seen if v == 'UNVERIFIED']
    return ('UNVERIFIED', bad[0], '', '') if bad else ('UNKNOWN', seen[0][1] if seen else 'no_method', '', '')


def via_trusted_proxy(remote_addr, trusted):
    try: peer = ipaddress.ip_address(remote_addr or '')
    except ValueError: return False
    return any(peer in net for net in trusted)


def client_ip(remote_addr, headers, trusted):
    """The client address, or None when the path is not trusted. X-Forwarded-For is read only from a listed proxy."""
    try: peer = ipaddress.ip_address(remote_addr or '')
    except ValueError: return None
    if via_trusted_proxy(remote_addr, trusted):
        raw = (headers.get('X-Real-IP') or '').strip() or (headers.get('X-Forwarded-For') or '').split(',')[-1].strip()
        try: return str(ipaddress.ip_address(raw))
        except ValueError: return None
    if not peer.is_global: return None  # a proxy in front that is not configured as trusted: the real client is unknown
    return str(peer)


def referrer_domain(referer, policy=None):
    """The listed AI service domain for a referrer (exact host or a dot-bounded subdomain), else None."""
    m = re.match(r'^https?://([^/:?#]+)', (referer or '').strip(), re.IGNORECASE)
    if not m: return None
    host = m.group(1).lower().rstrip('.')
    return next((d['domain'] for d in (policy or default_policy())['referrers'] if host == d['domain'] or host.endswith('.' + d['domain'])), None)


def prefetch(headers):
    purpose = ' '.join((headers.get(k) or '') for k in ('Purpose', 'Sec-Purpose', 'X-Purpose', 'X-Moz')).lower()
    return 'prefetch' in purpose or 'prerender' in purpose or 'preview' in purpose
