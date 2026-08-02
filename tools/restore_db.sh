#!/usr/bin/env bash
# Saigon Rider — PostgreSQL 복원 (pg restore drill / 실 복구) (게이트9 B-5)
#
# tools/backup_db.sh 산출물(backups/backup_<timestamp>.sql.gz)을 지정한 컨테이너에 복원한다.
#
# 사용법:
#   ./tools/restore_db.sh --container <이름> --dump <경로> [--commit]
#
#   --container   필수. 복원 대상 컨테이너 이름. 기본값 없음 — 실수로 운영 DB를
#                 대상으로 실행되는 것을 막기 위해 항상 명시해야 한다.
#                 'saigon_db' 및 'prod' 를 포함하는 이름은 이 스크립트가 거부한다
#                 (운영/개발 상시 DB를 덮어쓰는 사고 방지 — 복원은 항상 격리된
#                 임시 컨테이너를 새로 띄워서 한다).
#   --dump        필수. 복원할 backups/backup_*.sql.gz 경로.
#   --commit      실제로 psql 복원을 실행한다. 기본은 dry-run(무엇을 할지 출력만,
#                 아무것도 실행하지 않음) — backend/scripts/import_business_csv.py 관례.
#
# 예시 (restore drill — 격리 임시 컨테이너를 먼저 띄워둔 상태):
#   docker run -d --name saigon_db_restore_drill \
#     -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
#     postgis/postgis:15-3.3
#   ./tools/restore_db.sh --container saigon_db_restore_drill --dump backups/backup_20260802_180512.sql.gz --commit
#   docker rm -f saigon_db_restore_drill   # 검증 끝나면 반드시 제거
#
# 검증은 이 스크립트의 책임이 아니다 — 복원 후 information_schema.columns 스키마
# diff·주요 테이블 행수 대조는 별도로 수행할 것 (ai-docs/260802_backup_restore_drill.md 참조).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CONTAINER=""
DUMP_FILE=""
COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --dump) DUMP_FILE="$2"; shift 2 ;;
    --commit) COMMIT=true; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$CONTAINER" ]]; then
  echo "오류: --container 필수 (기본값 없음 — 운영/개발 상시 DB 오실행 방지)" >&2
  exit 1
fi
if [[ -z "$DUMP_FILE" ]]; then
  echo "오류: --dump 필수" >&2
  exit 1
fi

# ── 가드: 운영/상시 DB 컨테이너 오실행 차단 ──────────────────────────
if [[ "$CONTAINER" == "saigon_db" || "$CONTAINER" == *"prod"* ]]; then
  echo "오류: '$CONTAINER' 는 상시/운영 DB로 추정된다 — 이 스크립트로 직접 복원 금지." >&2
  echo "      복원은 항상 격리된 임시 컨테이너에 한다 (docker run --name <임시이름> postgis/postgis:15-3.3)." >&2
  exit 1
fi

DUMP_PATH="$DUMP_FILE"
if [[ ! -f "$DUMP_PATH" ]]; then
  # backups/ 상대경로도 허용
  DUMP_PATH="$ROOT_DIR/$DUMP_FILE"
fi
if [[ ! -f "$DUMP_PATH" ]]; then
  echo "오류: 덤프 파일을 찾을 수 없음: $DUMP_FILE" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "오류: 컨테이너 '$CONTAINER' 가 존재하지 않음. 먼저 격리된 임시 컨테이너를 띄워라." >&2
  exit 1
fi

RESTORE_CMD="gunzip -c \"$DUMP_PATH\" | docker exec -i \"$CONTAINER\" sh -c 'psql -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"'"

if [[ "$COMMIT" != true ]]; then
  echo "[dry-run] 아무것도 실행하지 않음. 실제 복원하려면 --commit 추가."
  echo "[dry-run] 대상 컨테이너: $CONTAINER"
  echo "[dry-run] 덤프 파일: $DUMP_PATH"
  echo "[dry-run] 실행될 명령:"
  echo "  $RESTORE_CMD"
  exit 0
fi

echo "복원 시작 -> 컨테이너 '$CONTAINER'"
gunzip -c "$DUMP_PATH" | docker exec -i "$CONTAINER" sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
echo "복원 완료. 검증(schema diff·행수 대조)은 별도로 수행할 것."
