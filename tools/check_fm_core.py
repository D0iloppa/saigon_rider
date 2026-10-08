"""FactMind core guard (plan 261008 §3.9 G4a, §3.2).

1) A staged change under factmind-saigon/factmind_saigon/core/ must come with a staged factmind-saigon/BACKPORT.md
   (a ledger entry; ``Kind: no-backport`` with a reason is a valid entry).
2) core/ stays portable: no app / sqlalchemy / fastapi / factmind_saigon.saigon imports.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE = "factmind-saigon/factmind_saigon/core/"
LEDGER = "factmind-saigon/BACKPORT.md"
FORBIDDEN = re.compile(r"^\s*(?:from|import)\s+(?:app\b|sqlalchemy\b|fastapi\b|factmind_saigon\.saigon\b)", re.MULTILINE)


def main() -> int:
    staged = subprocess.run(
        ["git", "diff", "--cached", "--name-only"], cwd=str(ROOT), stdout=subprocess.PIPE, universal_newlines=True, check=True
    ).stdout.split()
    errors = []
    if any(f.startswith(CORE) for f in staged) and LEDGER not in staged:
        errors.append(
            "core/ changed without a ledger entry: add one to %s and stage it "
            "(Kind: code | learning | no-backport — a no-backport entry with a reason also satisfies this)." % LEDGER
        )
    for path in sorted((ROOT / CORE).rglob("*.py")):
        match = FORBIDDEN.search(path.read_text(encoding="utf-8"))
        if match:
            errors.append("%s imports %r — core/ must stay stdlib-only and independent of the host app." % (path.relative_to(ROOT), match.group().strip()))
    for error in errors:
        print("fm-core-guard: " + error)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
