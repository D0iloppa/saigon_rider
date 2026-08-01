# 월드 페이지 SECTION 1/2 실데이터 연동

> **생성**: 2026-05-18 | **상태**: IN_PROGRESS

## 목표

월드 페이지(WorldMap)에서 SECTION 1(유저 재화 카드)과 SECTION 2(추천 퀘스트)를 실 데이터로 연동한다.

## 작업 범위

### 1단계: 인프라 — AppConfig 모델 + 시드

- `models.py`: `AppConfig` 모델 (기존 `app_config` 테이블 매핑)
- `schemas.py`: `AppConfigOut`, `AppConfigUpdate`
- 마이그레이션 `030_app_config_seed.sql`: `quest.recommend_max_count = 3`
- `admin.py`: `/admin/settings`에 추천 퀘스트 최대 개수 설정

### 2단계: SECTION 1 — 유저 재화 실시간 갱신

- WorldMap 마운트 시 유저 정보 재조회 → useUserStore 갱신
- `GET /users/me` 응답에 xp, gold, skill_pt 포함 확인

### 3단계: SECTION 2 — 추천 퀘스트 N개

- `GET /quests/recommended?user_id={uuid}` → `list[QuestOut]` (0~N개)
- app_config에서 recommend_max_count 읽어서 limit
- required_level <= user.level 필터 + 완료 퀘스트 제외
- 프론트: 가로 스와이프 캐러셀 + indicator dots
- 0개 시 빈 상태 표시, 1개 시 dots 숨김

## 변경 파일 (예정)

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/quests.py`
- `backend/app/routers/admin.py`
- `backend/app/templates/admin/settings.html`
- `database/init/030_app_config_seed.sql`
- `frontend/src/pages/home/WorldMap.tsx`
- `frontend/src/pages/home/WorldMap.module.css`
- `frontend/src/api/quests.ts`
- `frontend/src/api/auth.ts` (또는 profile.ts)
- `frontend/src/locales/{ko,en,vi}/translation.json`
