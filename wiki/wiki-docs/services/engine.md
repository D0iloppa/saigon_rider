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

## 주요 기능

| 도메인 | 기능 |
|---|---|
| 포인트 원장 | 적립 / 차감 이벤트 처리 |
| 리워드 포인트 | 만료 관리 (3개월) |
| 어뷰징 방지 | 일일 상한선 (일반 250 / 드라이버 2000) |
| 신규 계정 패널티 | 가입 후 3일 × 0.5 배율 |
| 멱등성 | 이벤트 TTL 7일 중복 방지 |
| 배치 잡 | APScheduler 4종 (만료·정산 등) |

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

## API 엔드포인트 (BFF→Engine 내부 호출)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/v1/health` | 헬스체크 |
| `POST` | `/v1/events/` | 포인트 이벤트 발행 |
| `GET` | `/v1/balance/{user_id}` | 잔액 조회 |
| `GET` | `/v1/quests/` | 퀘스트 목록 |
| `POST` | `/v1/rides/start` | 라이드 시작 |
| `POST` | `/v1/rides/end` | 라이드 종료 |

인증: `X-Service-Key: {ENGINE_SERVICE_KEY}` 헤더 필수.

## 기동

```bash
docker compose --profile backend up --build -d engine
docker compose logs -f engine
```
