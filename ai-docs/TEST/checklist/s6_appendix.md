# §6 부록 — 빠른 진단 명령

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)

```bash
# 1. 인프라
docker compose ps
docker logs --tail=100 saigon_bff
docker logs --tail=100 saigon_engine
docker logs --tail=100 saigon_nginx

# 2. BFF 헬스 + 라우터 확인
curl -i http://localhost:18090/api/bff/auth/me?phone=%2B84xxxxxxxxxx

# 3. Engine 직접(서비스키)
curl -i http://localhost:18090/api/sre/users/<UUID>/balance \
     -H "X-Service-Key: $ENGINE_SERVICE_KEY"

# 4. DB 점검
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM users;"
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM action_event;"
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT * FROM rp_balance ORDER BY updated_at DESC LIMIT 5;"

# 5. 배치 잡 수동 실행
docker exec saigon_engine python -m app.jobs.verify_balance
docker exec saigon_engine python -m app.jobs.expire_rp

# 6. 메트릭 / 헬스
curl http://localhost:18090/api/sre/healthz
curl http://localhost:18090/api/sre/metrics | head -50

# 7. Alembic 헤드 확인
docker exec saigon_engine alembic current
docker exec saigon_bff alembic current  # BFF Alembic 전환 시
```
