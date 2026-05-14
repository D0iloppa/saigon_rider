#!/bin/sh
# Wiki Basic Auth htpasswd 생성
# apache2-utils의 htpasswd를 사용해 APR1 해시 생성
set -e

WIKI_AUTH_USER="${WIKI_AUTH_USER:-admin}"
WIKI_AUTH_PASS="${WIKI_AUTH_PASS:-changeme}"

apk add --no-cache apache2-utils --quiet 2>/dev/null || true
htpasswd -bc /etc/nginx/.htpasswd "${WIKI_AUTH_USER}" "${WIKI_AUTH_PASS}"

echo "[entrypoint] wiki htpasswd generated for user: ${WIKI_AUTH_USER}"
