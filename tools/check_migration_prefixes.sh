#!/bin/bash
# database/init 마이그레이션 파일명 중복 numeric prefix 검사 (DB-6)
#
#   docker-entrypoint-initdb.d 는 파일명 알파벳순으로 실행되는데, 동일 prefix 파일이
#   여러 개면 실행 순서가 파일명 나머지 부분(알파벳)에 좌우되어 의도한 순서를 보장 못 한다.
#   이미 적용된 파일은 리네임하지 않는다(운영 DB 이력과 어긋남) — 이 스크립트는 "새 중복 발생"만 막는다.
#
# 사용법: ./tools/check_migration_prefixes.sh
# CI 미구성 — 현재는 로컬/push 전 수동 실행용. 필요 시 CI 워크플로우에 연결.
set -euo pipefail

INIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/database/init"

dupes=$(find "$INIT_DIR" -maxdepth 1 -name '*.sql' -printf '%f\n' \
    | grep -oE '^[0-9]+' \
    | sort | uniq -d)

if [ -n "$dupes" ]; then
    echo "ERROR: duplicate database/init numeric prefix(es) found:" >&2
    for n in $dupes; do
        echo "  $n:" >&2
        find "$INIT_DIR" -maxdepth 1 -name "${n}_*.sql" -printf '    %f\n' >&2
    done
    exit 1
fi

echo "OK: no duplicate database/init numeric prefixes."
