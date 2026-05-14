---
sidebar_position: 1
title: 전체 아키텍처
---

# 전체 아키텍처

:::warning 접근 제한
이 섹션은 Nginx HTTP Basic Auth로 보호됩니다.  
`.env`의 `WIKI_AUTH_USER` / `WIKI_AUTH_PASS`로 인증하세요.
:::

## 컨테이너 구성

| 컨테이너 | 이미지 | 프로파일 | 내부 포트 |
|---|---|---|---|
| `saigon_nginx` | nginx:alpine | 기본 | 80 |
| `saigon_frontend` | 커스텀 빌드 | 기본 | 80 |
| `saigon_imgproxy` | darthsim/imgproxy | 기본 | 8080 |
| `saigon_bff` | 커스텀 빌드 | backend | 8080 |
| `saigon_engine` | 커스텀 빌드 | backend | 8090 |
| `saigon_db` | postgis/postgis:15-3.3 | backend | 5432 |
| `saigon_wiki` | 커스텀 빌드 | wiki | 80 |

## 네트워크

모든 컨테이너는 `saigon-net` (bridge) 네트워크를 공유합니다.  
`NETWORK_BRIDGE` 환경변수로 이름 변경 가능.

## 보안 레이어

### Nginx 수준

```
/              → public
/api/          → public (앱 레벨 인증)
/admin/        → 앱 레벨 인증 (BFF 처리)
/wiki/         → public
/wiki/docs/private/ → HTTP Basic Auth (WIKI_AUTH_USER/PASS)
/engine/       → Docker 내부망 (172.16.0.0/12) 전용
```

### BFF 수준

- JWT 없음 (현재 passcode 기반 쿠키 인증)
- Admin Console: BFF 자체 인증 처리

### Engine 수준

- `X-Service-Key` 헤더 검증
- Nginx에서 이미 외부 접근 차단

## 인증 흐름

```
[앱] → POST /api/auth/register → { passcode, user }
     → 쿠키 저장 { phone, passcode, userId }
     → ProfileSetup → Home

[재기동] → 쿠키 읽기 → POST /api/auth/login → { user }
         → 자동 로그인 → Home
```

## 이미지 서빙 흐름

```
[앱] → POST /api/contents/upload
     → BFF: 파일 저장 (./contents/user-contents/)
     → imgproxy URL 생성 → 응답

[앱] → GET /img/insecure/{options}/plain/local:///{path}@webp
     → Nginx → imgproxy → 처리된 이미지 반환
```

## BFF → Engine 연동 흐름

```
[앱] → POST /api/bff/ride/submit
     → BFF.ride_router → engine_client.post_event()
     → HTTP POST /v1/events (X-Service-Key 포함)
     → Engine: RIDE_KM 이벤트 처리 → RP 계산 → 응답
     → BFF → 앱에 결과 반환
```
