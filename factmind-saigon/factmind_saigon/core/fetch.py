"""C1 - SSRF-safe public reader (HTTPS only, every DNS answer global, IP-pinned connect, redirects re-checked).

Vendored from FactMind site/public_delivery.py:19-143 (upstream f6b1772). Stdlib only; synchronous on purpose:
an async caller wraps it in asyncio.to_thread. Error wording is replaced by FetchError.code; the market-specific
value (User-Agent) is a parameter whose default equals upstream.
"""
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import http.client
import ipaddress
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit, urljoin, quote

MAX_BYTES = 1024 * 1024
TOTAL_SECONDS = 20
USER_AGENT = 'FactMindReadOnly/1.0'


class FetchError(ValueError):
    """A refused or failed read. `code` is a stable identifier; wording belongs to the caller's locale.
    Subclasses ValueError so callers that catch (OSError, ValueError) keep working."""
    def __init__(self, code):
        super().__init__(code); self.code = code


def _abort(sock):
    try: sock.shutdown(socket.SHUT_RDWR)
    except OSError: pass


class Deadline:
    """One overall time budget per fetch; per-operation timeouts alone let a slow drip hold a worker."""
    def __init__(self, seconds): self.until = time.monotonic() + seconds
    def left(self):
        value = self.until - time.monotonic()
        if value <= 0: raise FetchError('timeout')
        return value
    def watch(self, sock):
        timer = threading.Timer(self.left(), _abort, (sock,)); timer.daemon = True; timer.start()
        return timer


def public_target(url):
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 33 for c in url):
        raise FetchError('invalid_url')
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.fragment or p.port not in (None, 443):
        raise FetchError('https_only')
    host = p.hostname.encode('idna').decode('ascii')
    addresses = sorted({v[4][0] for v in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(v).is_global for v in addresses):
        raise FetchError('internal_network')
    return p, host, addresses


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=8, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Connect to the validated IP, retaining the original hostname for TLS.
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch_public(url, seconds=TOTAL_SECONDS, follow_redirects=True, types=('text/', 'json', 'xml'), user_agent=USER_AGENT):
    # T_ observation §4-1: official bot IP feeds are fetched with follow_redirects=False (a moved feed is a failure, not a hop).
    requested = url
    redirects = []
    deadline = Deadline(seconds)
    for _ in range(4):
        deadline.left()
        p, host, addresses = public_target(url)
        connection = PinnedHTTPS(host, addresses[0])
        timer = None
        try:
            connection.connect(); timer = deadline.watch(connection.sock)
            path = quote(p.path or '/', safe='/%:@!$&\'()*+,;=-._~') + ('?' + p.query if p.query else '')
            connection.request('GET', path, headers={'User-Agent': user_agent, 'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            headers = {k.lower(): v for k, v in response.getheaders()}
            if response.status in (301, 302, 303, 307, 308):
                if not follow_redirects: raise FetchError('redirect_not_followed')
                if not headers.get('location'): raise FetchError('redirect_no_location')
                next_url = urljoin(url, headers['location'])
                redirects.append({'from': url, 'to': next_url, 'status': response.status})
                url = next_url
                continue  # Every redirect gets a new DNS/IP/protocol check.
            raw = response.read(MAX_BYTES + 1)
            deadline.left()  # a watchdog abort surfaces here instead of as truncated evidence
            if len(raw) > MAX_BYTES: raise FetchError('too_large')
            if headers.get('content-encoding', 'identity') != 'identity': raise FetchError('compressed')
            content_type = headers.get('content-type', '').lower()
            if not any(v in content_type for v in types):
                raise FetchError('not_text')
            text = raw.decode('utf-8-sig', errors='strict')
            return {'url': requested, 'final_url': url, 'observed_at': datetime.now(timezone.utc).isoformat(),
                    'http_status': response.status, 'headers': headers, 'body_sha256': sha256(raw).hexdigest(),
                    'response_text': text, 'body_bytes': len(raw), 'dns_addresses': addresses,
                    'tls_verified': True, 'redirects': redirects, 'actual_crawler_visit': False,
                    'index_status': 'UNKNOWN', 'ai_exposure': 'NOT_MEASURED', **html_facts(text)}
        finally:
            if timer: timer.cancel()
            connection.close()
    raise FetchError('too_many_redirects')


class PageFacts(HTMLParser):
    def __init__(self):
        super().__init__(); self.canonical = []; self.robots = []; self.links = []
    def handle_starttag(self, tag, attrs):
        d = {k: (v or '') for k, v in attrs}
        if tag == 'link' and 'canonical' in d.get('rel', '').lower().split(): self.canonical.append(d.get('href', ''))
        if tag == 'meta' and d.get('name', '').lower() in ('robots', 'googlebot'): self.robots.append(d.get('content', '').lower())
        if tag == 'a' and d.get('href'): self.links.append(d['href'])


def html_facts(text):
    p = PageFacts(); p.feed(text)
    return {'canonical': p.canonical, 'meta_robots': p.robots, 'links': p.links}


class VisibleText(HTMLParser):
    """Text a crawler gets without running scripts; noscript text is kept apart because it shows only with scripts off."""
    HIDDEN = {'script', 'style', 'template', 'svg', 'noscript'}
    def __init__(self):
        super().__init__(); self.hidden = 0; self.inside_noscript = 0; self.parts = []; self.noscript = []
    def handle_starttag(self, tag, attrs):
        if tag in self.HIDDEN: self.hidden += 1
        if tag == 'noscript': self.inside_noscript += 1
    def handle_endtag(self, tag):
        if tag in self.HIDDEN and self.hidden: self.hidden -= 1
        if tag == 'noscript' and self.inside_noscript: self.inside_noscript -= 1
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)
        elif self.inside_noscript: self.noscript.append(data)


def visible_text(text):
    p = VisibleText(); p.feed(text)
    return ' '.join(''.join(p.parts).split()), ' '.join(''.join(p.noscript).split())
