#!/usr/bin/env bash
# Stop hook: 이번 턴에 파일 수정(Edit/Write)이 있었으면
#  1) codebase-memory fast 재색인을 CLI로 백그라운드 트리거 (MCP 연결 불필요 — 단절 내성)
#  2) Claude에게 ADR/page-map 갱신 필요 여부를 1회 점검시킴 (decision:block)
# 플래그는 PostToolUse(Edit|Write|NotebookEdit) hook이 생성한다.
IN=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-/mnt/c/DEV/saigon_rider}"
FLAG="$ROOT/.claude/.needs-reindex"
[ -f "$FLAG" ] || exit 0
rm -f "$FLAG"

CBM="$(command -v codebase-memory-mcp || true)"
[ -z "$CBM" ] && [ -x "$HOME/.local/bin/codebase-memory-mcp" ] && CBM="$HOME/.local/bin/codebase-memory-mcp"
if [ -n "$CBM" ]; then
  nohup "$CBM" cli index_repository "{\"repo_path\":\"$ROOT\",\"mode\":\"fast\"}" \
    >> "$ROOT/.claude/reindex.log" 2>&1 &
fi

# stop-hook 연쇄(이미 block으로 이어진 턴)에서는 다시 막지 않는다 — 무한루프 가드
ACTIVE=$(printf '%s' "$IN" | jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$ACTIVE" = "true" ] && exit 0

printf '%s' '{"decision":"block","reason":"[자동 파이프라인] 이번 턴에 파일 수정이 감지되어 codebase-memory fast 재색인을 백그라운드로 이미 트리거했다(index_repository 호출 불필요). 남은 점검 1가지: 이번 변경이 화면/메뉴 구조, 라우트 배선, 도메인 규칙에 영향을 줬다면 manage_adr 갱신(+ ai-docs/context/frontend-page-map.md 동기화)을 수행하라. 해당 없으면 아무 작업 없이 종료하라."}'
