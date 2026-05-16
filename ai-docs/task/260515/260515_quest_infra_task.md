# Quest 인프라 3종 태스크

**등록일**: 2026-05-15  
**상태**: 완료 (2026-05-15)

---

## 배경

퀘스트 목록 등록(미션 CSV → quests 테이블) 및 i18n 다국어 컬럼 적용 완료 후,
구조적으로 미완성인 세 영역 식별.

---

## 태스크 1 — District Enum 정의 ✅

### 구현 내역
- `frontend/src/constants/districts.ts` — HCM 17개 구 `DISTRICTS` 배열 + `District` 타입 정의
- `QuestList.tsx` 필터 구조 변경:
  - `activeFilter` → `activeDistrict` + `activeMisc` 분리
  - District chip: 17개 구 전체를 `overflow-x: auto` 스크롤 행으로 표시
  - 기타 필터(commute/night/safetyA) 별도 행으로 분리
  - `FILTER_PARAMS` 하드코딩 제거 → `buildFilterParams()` 함수로 대체

---

## 태스크 2 — 퀘스트 수행 이력 추적 (중복 방지) ✅

### 구현 내역

#### DB (`database/init/006_quest_period_key.sql`)
```sql
ALTER TABLE user_quests ADD COLUMN period_key VARCHAR(20);
CREATE UNIQUE INDEX uq_user_quest_period
  ON user_quests (user_id, quest_id, period_key) WHERE status = 'COMPLETED';
```
→ DB 직접 적용 완료

#### period_key 규칙
| quest.period | period_key | 비고 |
|---|---|---|
| DAILY | `2026-05-15` | 날짜 기준 |
| WEEKLY | `2026-W20` | ISO 주차 |
| EVENT | `ONCE` | 고정값 → 1회만 |

#### BFF (`backend/app/models.py`, `routers/quests.py`)
- `UserQuest.period_key: Mapped[str | None]` 컬럼 추가
- `_calc_period_key(period)` 함수 추가
- `accept_quest`: COMPLETED 레코드 존재 시 409 반환, 신규 수락 시 period_key 자동 설정

---

## 태스크 3 — 퀘스트 이미지 → contents 테이블 연동 ✅

### 구현 내역

#### DB (`database/init/007_quest_thumbnail_content.sql`)
```sql
ALTER TABLE quests ADD COLUMN thumbnail_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;
```
→ DB 직접 적용 완료

#### BFF
- `Quest.thumbnail_content_id` FK + `thumbnail_content` relationship (`lazy="selectin"`) 추가
- `QuestOut.thumbnail_url: str | None` 필드 추가
- `_apply_lang()`: `thumbnail_content.file_path` → `/img/{path}` URL 조합, 없으면 `hero_image_url` 폴백

#### 프론트
- `api/quests.ts`: `thumbnailUrl = raw.thumbnail_url ?? raw.hero_image_url ?? ''`

#### 규칙
- `owner_type = 'system'`, `owner_id = NULL` (시스템 공통 콘텐츠와 동일)
- 기존 `hero_image_url` 컬럼은 폴백용으로 유지

---

## 완료 조건

- [x] `constants/districts.ts` 작성, QuestList chips 연동
- [x] `user_quests.period_key` 컬럼 + unique 인덱스 적용
- [x] accept 엔드포인트에 중복 방지 로직 추가
- [x] `quests.thumbnail_content_id` FK 추가, BFF 모델/스키마 반영
