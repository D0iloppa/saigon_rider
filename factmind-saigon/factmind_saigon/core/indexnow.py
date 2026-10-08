"""C6 - IndexNow submission. A 200/202 means "received", never "indexed".

Vendored from FactMind site/public_delivery.py:352-365 (upstream f6b1772). Stdlib only. The engine list is data:
INDEXNOW_ENGINES defaults to upstream (Naver, Bing); a caller passes its own list of (name, endpoint).
"""
import json
import re
import urllib.error
import urllib.request

INDEXNOW_ENGINES = (('naver', 'https://searchadvisor.naver.com/indexnow'), ('bing', 'https://www.bing.com/indexnow'))
INDEXNOW_KEY = re.compile(r'[A-Za-z0-9-]{8,128}')


def indexnow_send(endpoint, body, timeout=4, user_agent='FactMindIndexNow/1.0'):
    request = urllib.request.Request(endpoint, data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': user_agent})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
