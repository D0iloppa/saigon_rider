#!/usr/bin/env bash
# =============================================================
# Saigon Rider — Let's Encrypt 인증서 자동 갱신
# 설치: sudo cp deploy/renew-certs.sh /usr/local/bin/renew-certs.sh
#       sudo chmod +x /usr/local/bin/renew-certs.sh
# cron: sudo crontab -e 에 아래 한 줄 (하루 2회, certbot 권장)
#   17 3,15 * * * /usr/local/bin/renew-certs.sh >> /var/log/certbot-renew.log 2>&1
#
# certbot renew 는 /etc/letsencrypt/renewal/*.conf 의 모든 인증서를
# (saigon-rider.com + letantonsheriff.com) 만료 30일 전부터만 갱신한다.
# 실제 갱신이 일어난 경우에만 deploy-hook 으로 host nginx 를 reload.
# 갱신 방식은 각 cert 의 authenticator = nginx (HTTP-01) → DNS 조작 불필요.
# =============================================================
set -euo pipefail

# root 개인 crontab(/var/spool/cron/root)은 PATH=/usr/bin:/bin 이라 /usr/sbin/nginx 를 못 찾는다 →
# certbot nginx 플러그인이 NoInstallationError 로 매번 실패해 2026-10-14 인증서가 만료됐다. 명시한다.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
