---
sidebar_position: 2
title: Frontend (BFE)
---

# Frontend — React + Vite

## 기술 스택

| 라이브러리 | 역할 |
|---|---|
| React 18 | UI 렌더링 |
| Vite | 번들러 / HMR |
| TypeScript | 타입 안전성 |
| Zustand | 전역 상태 관리 |
| React Router DOM | 클라이언트 라우팅 |
| i18next | 다국어 (ko / vi / en) |
| Capacitor | iOS / Android 네이티브 셸 |

## 접속

| 환경 | URL |
|---|---|
| Nginx 경유 (프로덕션 빌드) | http://localhost:18090 |
| Vite 직접 (HMR) | http://localhost:5174 |

## 빌드 & 배포

```bash
# 전체 재빌드 (프로덕션)
docker compose --env-file .env up --build -d frontend

# 로그 확인
docker compose logs -f frontend
```

## 주요 디렉토리

```
frontend/src/
├── api/          # fetch 래퍼 (auth, feed, quests, client)
├── components/   # 레이아웃(AppShell, TabBar) + 공통 UI
├── data/         # 더미 데이터 (feed, quests, countryCodes)
├── lib/          # 유틸 (format, i18n, rewards, session)
├── pages/        # 화면별 컴포넌트
│   ├── auth/     # PhoneInput, OtpInput, ProfileSetup, Splash
│   ├── feed/     # FeedList
│   ├── home/     # WorldMap
│   ├── quest/    # QuestList, QuestDetail
│   ├── ride/     # RideActive, RideResult
│   └── settings/ # Settings, NotiSettings, LangSettings
└── store/        # Zustand stores (user, ride)
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_USE_MOCK` | `true` | true = 더미 데이터, false = 실제 API |
| `VITE_API_BASE` | `http://localhost:18090/api` | API 기본 URL |
