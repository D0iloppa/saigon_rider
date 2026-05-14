---
sidebar_position: 4
title: SRE Engine
---

# SRE Engine

포인트 적립·차감·리워드 계산 전담 마이크로서비스. BFF의 내부 의존 서비스이며 외부에서 직접 접근 불가.

## 접근 제한

```nginx
# nginx 설정 — 172.16.0.0/12 (Docker 내부망)만 허용
location /engine/ {
    allow 172.16.0.0/12;
    deny all;
    ...
}
```

외부에서 직접 접근 시 `403 Forbidden` 반환.  
BFF는 내부망에서 `http://engine:8090` 으로 접근합니다.

## 주요 기능

| 도메인 | 기능 |
|---|---|
| 포인트 원장 | 적립 / 차감 이벤트 처리 |
| 리워드 포인트 | 만료 관리 (3개월) |
| 어뷰징 방지 | 일일 상한선 (일반 250 / 드라이버 2000) |
| 신규 계정 패널티 | 가입 후 3일 × 0.5 배율 |
| 멱등성 | 이벤트 TTL 7일 중복 방지 |
| 배치 잡 | APScheduler 4종 (만료·정산 등) |

## API 엔드포인트 (BFF → Engine 내부 호출)

> Nginx 외부 경로: `/api/sre/*` → Engine `/v1/*`  
> 인증: `X-Service-Key: {ENGINE_SERVICE_KEY}` 헤더 필수

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/v1/health` | 헬스체크 |
| `POST` | `/v1/events` | 포인트 이벤트 발행 (RIDE_KM, QUEST_COMPLETE 등) |
| `GET` | `/v1/users/{id}/balance` | RP 잔액 조회 |
| `GET` | `/v1/users/{id}/transactions` | RP 거래 내역 |
| `GET` | `/v1/users/{id}/missions` | 미션 진행도 조회 |
| `GET` | `/v1/catalog` | 보상 카탈로그 조회 |
| `POST` | `/v1/users/{id}/redemptions` | 보상 교환 요청 |
| `GET/POST` | `/v1/admin/*` | Engine 관리자 API |

## SRE 비즈니스 룰 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SRE_TIMEZONE` | `Asia/Ho_Chi_Minh` | 기준 시간대 |
| `SRE_RP_EXPIRY_MONTHS` | `3` | 리워드 포인트 만료 월수 |
| `SRE_DAILY_CAP_STANDARD` | `250` | 일반 사용자 일일 상한 |
| `SRE_DAILY_CAP_DRIVER` | `2000` | 드라이버 일일 상한 |
| `SRE_NEW_ACCOUNT_PENALTY_DAYS` | `3` | 신규 패널티 적용 일수 |
| `SRE_NEW_ACCOUNT_MULTIPLIER` | `0.5` | 패널티 배율 |
| `SRE_IDEMPOTENCY_TTL_DAYS` | `7` | 멱등성 키 TTL |
| `SRE_LOG_LEVEL` | `INFO` | 로그 레벨 |

## 기동

```bash
docker compose --profile backend up --build -d engine
docker compose logs -f engine

# DB 마이그레이션 (Alembic)
docker compose --profile backend exec engine alembic upgrade head
docker compose --profile backend exec engine alembic history
```
