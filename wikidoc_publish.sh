#!/usr/bin/env bash
#
# wikidoc_publish.sh — Wiki Private 문서 동기화 & 무중단 발행
#
# 동작 흐름:
#   1. docs/TEST/*.md  →  wiki/wiki-docs/private/test/<safe>.md 로 복사
#      · 파일명 정규화(소문자 + 언더스코어→하이픈)
#      · Docusaurus front-matter(title) 자동 주입
#      · 본문 상단에 "자동 동기화 문서" admonition 삽입
#      · 각 실행마다 wiki/wiki-docs/private/test/*.md 를 전부 삭제 후 재생성(정합성)
#   2. _category_.json 미존재 시 "Test / QA" 카테고리 메타 자동 생성
#   3. saigon_wiki 컨테이너만 재빌드·재기동 (--no-deps, 다른 서비스 무중단)
#
# 사용법:
#   ./wikidoc_publish.sh              # 동기화 + 발행 (기본)
#   ./wikidoc_publish.sh --sync-only  # 파일 복사만 (docker 명령 생략)
#   ./wikidoc_publish.sh --no-build   # 동기화 + 컨테이너 재기동만(이미지 재빌드 생략)
#   ./wikidoc_publish.sh -h           # 도움말 표시
#
# 발행 후 확인:
#   Public  : http://localhost:18090/wiki/
#   Private : http://localhost:18090/wiki/docs/private/test/   (Basic Auth 필요)
#   Auth    : .env 의 WIKI_AUTH_USER / WIKI_AUTH_PASS
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TEST="$ROOT/docs/TEST"
DST_TEST="$ROOT/wiki/wiki-docs/private/test"

SYNC_ONLY=false
NO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --sync-only) SYNC_ONLY=true ;;
    --no-build)  NO_BUILD=true ;;
    -h|--help)
      sed -n '/^# wikidoc_publish.sh/,/^$/p' "$0" | sed 's/^#\s\?//'
      exit 0
      ;;
    *)
      echo "[wikidoc_publish] 알 수 없는 옵션: $arg" >&2
      echo "  ./wikidoc_publish.sh --help 로 도움말 확인" >&2
      exit 1
      ;;
  esac
done

log() { echo "[wikidoc_publish] $*"; }

# ── 1. private/test 동기화 ──────────────────────────────────
log "1/3 docs/TEST  →  wiki/wiki-docs/private/test 동기화"
mkdir -p "$DST_TEST"

# 기존 md 정리(category 메타는 보존)
find "$DST_TEST" -maxdepth 1 -type f -name '*.md' -delete

if [ ! -d "$SRC_TEST" ]; then
  log "  (docs/TEST 디렉터리 없음 — 동기화 생략)"
else
  shopt -s nullglob
  count=0
  for src in "$SRC_TEST"/*.md; do
    name="$(basename "$src")"
    safe="$(echo "$name" | tr '[:upper:]_' '[:lower:]-')"
    dest="$DST_TEST/$safe"

    title="$(grep -m1 '^# ' "$src" | sed -E 's/^#\s+//' || true)"
    [ -z "$title" ] && title="${name%.md}"

    {
      echo "---"
      echo "title: \"$title\""
      echo "---"
      echo
      echo ":::info 자동 동기화 문서"
      echo "이 페이지는 \`docs/TEST/${name}\` 에서 자동 복사되었습니다."
      echo "편집은 **원본 파일**에서, 발행은 프로젝트 루트의 \`./wikidoc_publish.sh\` 로 수행하세요."
      echo ":::"
      echo
      cat "$src"
    } > "$dest"

    echo "  ✓ ${name}  →  private/test/${safe}"
    count=$((count + 1))
  done
  shopt -u nullglob
  log "  총 ${count}개 파일 동기화 완료"
fi

# ── _category_.json 자동 생성(최초 1회만) ────────────────────
CAT_FILE="$DST_TEST/_category_.json"
if [ ! -f "$CAT_FILE" ]; then
  cat > "$CAT_FILE" <<'JSON'
{
  "label": "Test / QA",
  "position": 99,
  "collapsed": false,
  "link": null
}
JSON
  log "  ✓ _category_.json 생성 (Test / QA 카테고리)"
fi

if [ "$SYNC_ONLY" = true ]; then
  log "--sync-only 옵션: docker 발행 생략, 종료"
  exit 0
fi

# ── 2. wiki 컨테이너만 재발행 ────────────────────────────────
log "2/3 saigon_wiki 컨테이너 재발행 (--no-deps · 무중단)"

COMPOSE_ARGS=(--env-file "$ROOT/.env" --profile wiki up -d --no-deps)
if [ "$NO_BUILD" = false ]; then
  COMPOSE_ARGS+=(--build)
fi
COMPOSE_ARGS+=(wiki)

cd "$ROOT"
docker compose "${COMPOSE_ARGS[@]}"

# ── 3. 결과 안내 ────────────────────────────────────────────
log "3/3 ✅ 발행 완료"
echo
echo "  Public  : http://localhost:18090/wiki/"
echo "  Private : http://localhost:18090/wiki/docs/private/test/   (Basic Auth 필요)"
echo "  Auth    : .env 의 WIKI_AUTH_USER / WIKI_AUTH_PASS 사용"
