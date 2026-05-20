# Redis Streams 메시지 큐 도입

> **Feature #47** (`infra`) | 생성: 2026-05-20 | 상태: ✅ DONE (2026-05-20)

## 배경

현재 `GET /v1/sreMessage` 엔드포인트는 수신 즉시 PostgreSQL에 직접 INSERT한다. 캐시워크 규모(1000대+) 서비스에서는 GPS/heartbeat/event 메시지가 수백~수천 TPS를 발생시켜 DB 병목 및 서비스 장애 위험이 있다.

Redis Streams를 메시지 버퍼로 도입하여:
1. API는 Redis XADD만 수행 → 즉시 응답 (DB 부하 분리)
2. Consumer Worker가 배치로 PostgreSQL bulk INSERT
3. DB 장애 시에도 메시지 유실 방지 (Redis 버퍼)

## 아키텍처

```
[단말] → GET /v1/sreMessage → Engine (XADD) → Redis Streams
                                                    ↓ Consumer Group
                                              Worker (bulk INSERT) → PostgreSQL
```

## 인프라 변경

| 항목 | 변경 |
|---|---|
| Redis 7 | docker-compose 서비스 추가 (포트 미노출, 내부 네트워크만) |
| Worker | 같은 engine 이미지, 별도 entrypoint (consumer 프로세스) |
| .env | REDIS_URL 추가 |

## 서브태스크

| # | 내용 | 상태 |
|---|---|---|
| SUB-1 | Redis 서비스 docker-compose 추가 + .env 설정 | ✅ DONE |
| SUB-2 | redis-py 의존성 추가 + Redis 클라이언트 모듈 (engine/app/redis_client.py) | ✅ DONE |
| SUB-3 | 메시지 엔드포인트 변경 — DB INSERT → Redis XADD | ✅ DONE |
| SUB-4 | Consumer Worker 구현 (XREADGROUP + bulk INSERT) | ✅ DONE |
| SUB-5 | Worker 서비스 docker-compose 등록 (entrypoint 분리) | ✅ DONE |
| SUB-6 | Fallback 처리 — Redis 장애 시 직접 DB INSERT | ✅ DONE (SUB-3에 포함) |
| SUB-7 | 통합 테스트 + docker compose up 검증 | ✅ DONE |

## 설계 결정

- **Redis 포트 미노출**: Docker 내부 네트워크 전용. 디버깅은 `docker exec -it redis redis-cli`
- **TimescaleDB / PgBouncer**: 이번 태스크 범위 외. 트래픽 증가 시 별도 태스크로 진행
- **Kafka 아님**: 1K~10K 단말 규모에서 Redis Streams가 운영 복잡도 대비 최적
