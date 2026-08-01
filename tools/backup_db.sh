#!/usr/bin/env bash
# Saigon Rider — PostgreSQL 백업 (pg_dump) + 보존정책 (F-16 코드 범위)
#
# 사용법: ./tools/backup_db.sh
# 산출물: backups/backup_<timestamp>.sql.gz (git 미추적 — .gitignore 등록됨)
# 보존정책: RETENTION_DAYS(기본 14일)보다 오래된 덤프 자동 삭제.
#
# 외부(오프사이트) 저장·restore drill·RPO/RTO 측정은 운영 소관(원장 B-5) — 이 스크립트는
# dev pg_dump 산출만 담당한다.
#
# 복원: gunzip -c backups/backup_<timestamp>.sql.gz | docker exec -i saigon_db \
#         sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER="${DB_CONTAINER:-saigon_db}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

echo "Backing up container '$CONTAINER' -> $OUT_FILE"
docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUT_FILE"
echo "Backup complete: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# 보존정책: RETENTION_DAYS 초과 덤프 삭제
find "$BACKUP_DIR" -name 'backup_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "Restore: gunzip -c $OUT_FILE | docker exec -i $CONTAINER sh -c 'psql -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"'"
