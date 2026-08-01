# §0 점검 절차 / 헬스

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)

| 단계 | 작업 | 명령/도구 | 상태 |
|---|---|---|---|
| 0-1 | 인프라 기동 확인 | `docker compose ps` — `saigon_nginx`, `saigon_frontend`, `saigon_bff`, `saigon_engine`, `saigon_db`, `saigon_imgproxy` 모두 `Up` 상태 | ✅ |
| 0-2 | 헬스체크 | `curl -i http://localhost:18090/` (200), `curl -i http://localhost:18090/api/bff/health` (200), `curl -i http://localhost:18090/api/sre/health` (200) ⚠️ 체크리스트 경로 `/api/sre/healthz` → 실제 엔드포인트는 `/api/sre/health` | ✅ |
| 0-3 | 화면 진입 점검 | 브라우저로 §1 표의 URL 직접 호출, 콘솔/네트워크 오류 모니터링 | ⬜ |
| 0-4 | API 호출 점검 | DevTools Network 탭 또는 `curl` 로 §2 항목 검증 | ⬜ |
| 0-5 | DB 사이드이펙트 점검 | psql 쿼리(섹션별 명시) | ⬜ |
| 0-6 | 엔진 직접 호출 | §3 의 `curl -H "X-Service-Key: $ENGINE_SERVICE_KEY" ...` | ⬜ |
