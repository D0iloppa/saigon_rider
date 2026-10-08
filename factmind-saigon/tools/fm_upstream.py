"""Where each vendored core file came from, and whether either side moved since (plan 261008 §3.9 G1).

  python factmind-saigon/tools/fm_upstream.py --upstream /DEVELOP/Blueurban/factmind            # read-only status table
  python factmind-saigon/tools/fm_upstream.py --upstream /DEVELOP/Blueurban/factmind --record   # rewrite UPSTREAM.json

UPSTREAM.json is generated, never hand-written. It stores, per core file, the sha256 (CRLF normalised to LF) of the whole
local file and of the whole upstream file as of the last --record; the `lines` ranges are notes for people. Status:
  unchanged         neither side differs from the recorded sha
  local-modified    core changed here (expected - BACKPORT.md has the entry)
  upstream-ahead    the upstream file changed since the port; read its diff and decide
  both              both of the above
  unknown-upstream  no upstream checkout (or no record yet); reported, never a failure
Run --record only right after the port or after a deliberate sync, because it accepts the current state of both sides.
Python 3.8 syntax only.
"""
import argparse
import json
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
CORE = PKG / 'factmind_saigon' / 'core'
MANIFEST = PKG / 'UPSTREAM.json'

# local file under core/ -> upstream file (relative to the FactMind root) and the line ranges it was cut from
MAP = (
    ('fetch.py', 'site/public_delivery.py', '19-143'),
    ('site_report.py', 'site/site_report.py', '19-224'),
    ('access.py', 'site/public_delivery.py', '146-281'),
    ('bundle.py', 'site/public_delivery.py', '284-349,376-521'),
    ('verify.py', 'site/self_service.py', '176-190'),
    ('indexnow.py', 'site/public_delivery.py', '354-365'),
    ('bots.py', 'site/observation_collect.py', '48-206'),
    ('bot_policy_upstream.json', 'site/observation_policy.json', 'whole file'),
    ('bot_policy.json', 'site/observation_policy.json', 'whole file, Yeti/Daum removed'),
    ('locale/ko.py', 'site/public_delivery.py', 'wording only'),
)


def sha(path):
    """sha256 of the whole file with CRLF -> LF, or None when it cannot be read."""
    try:
        return sha256(Path(path).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
    except OSError:
        return None


def head(upstream):
    try:
        out = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=str(upstream), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, universal_newlines=True)
    except OSError:
        return None
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else None


def status(local_sha, recorded, upstream_sha):
    if upstream_sha is None or recorded is None:
        return 'unknown-upstream'
    ahead = upstream_sha != recorded['upstream_sha256']
    local = local_sha != recorded['local_sha256']
    return 'both' if ahead and local else 'upstream-ahead' if ahead else 'local-modified' if local else 'unchanged'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--upstream', required=True, help='FactMind checkout (read only)')
    parser.add_argument('--record', action='store_true', help='rewrite UPSTREAM.json from the current state')
    args = parser.parse_args()
    upstream = Path(args.upstream)
    commit = head(upstream)
    old = {e['local']: e for e in json.loads(MANIFEST.read_text(encoding='utf-8'))['entries']} if MANIFEST.exists() else {}
    if args.record and commit is None:
        print('refusing to record: %s is not a readable git checkout' % upstream)
        return 1
    entries, rows = [], []
    for local, path, lines in MAP:
        name = 'core/' + local
        recorded = old.get(name)
        upstream_sha = sha(upstream / path) if commit else None
        entry = {'local': name, 'upstream': [{'path': path, 'lines': lines}], 'upstream_commit': commit if args.record else (recorded or {}).get('upstream_commit'),
                 'upstream_sha256': upstream_sha if args.record else (recorded or {}).get('upstream_sha256'), 'local_sha256': sha(CORE / local)}
        entry['status'] = 'unchanged' if args.record else status(entry['local_sha256'], recorded, upstream_sha)
        entries.append(entry)
        rows.append((entry['status'], name, path + ':' + lines))
    for state, local, source in rows:
        print('%-17s %-34s <- %s' % (state, local, source))
    print('upstream HEAD: %s' % (commit or 'unknown'))
    if args.record:
        MANIFEST.write_text(json.dumps({'entries': entries}, indent=2) + '\n', encoding='utf-8')
        print('recorded %s' % MANIFEST.relative_to(PKG.parent))
    elif not old:
        print('no UPSTREAM.json yet - run with --record')
    return 0


if __name__ == '__main__':
    sys.exit(main())
