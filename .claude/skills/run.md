# run — Saigon Rider 앱 빌드 & 배포

Docker Compose 환경. 단일 Nginx(:18090) 진입, 서비스별 컨테이너.

## 서비스별 재배포 명령

```bash
# 프론트엔드 (Vite → Nginx)
docker compose --env-file .env up --build -d frontend

# BFF (FastAPI :8080)
docker compose --env-file .env up --build -d saigon_bff

# 엔진 (FastAPI :8090)
docker compose --env-file .env up --build -d saigon_engine

# 전체
docker compose --env-file .env up --build -d
```

## 확인

```bash
docker compose ps          # 컨테이너 상태
docker compose logs -f frontend  # 프론트 로그
```

## 주의

- `vite build`만 실행해도 로컬 `dist/`만 바뀌고 컨테이너 이미지는 갱신 안 됨.
- 반드시 `docker compose --env-file .env up --build -d <서비스>` 로 이미지 재빌드 필요.
- 작업 디렉터리: `/mnt/c/DEV/saigon_rider`
