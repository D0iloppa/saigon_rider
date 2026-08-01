#!/bin/sh
# Wiki Basic Auth htpasswd 생성
# apache2-utils의 htpasswd를 사용해 APR1 해시 생성
set -e

WIKI_AUTH_USER="${WIKI_AUTH_USER:-admin}"

# 기본값 금지 — 공개 비밀번호(changeme)로 htpasswd 가 조용히 생성되는 사고 방지 (fail-fast)
if [ -z "${WIKI_AUTH_PASS:-}" ]; then
    echo "[entrypoint] ERROR: WIKI_AUTH_PASS is not set — refusing to generate htpasswd with a default password" >&2
    exit 1
fi

apk add --no-cache apache2-utils --quiet 2>/dev/null || true
htpasswd -bc /etc/nginx/.htpasswd "${WIKI_AUTH_USER}" "${WIKI_AUTH_PASS}"

echo "[entrypoint] wiki htpasswd generated for user: ${WIKI_AUTH_USER}"
