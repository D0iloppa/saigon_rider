# app_config 테이블 — 작업 이력 및 사용 가이드

> **날짜**: 2026-05-15  
> **상태**: ✅ 완료

---

## 작업 이력

| 시각 | 내용 |
|---|---|
| 260515 | `005_app_config.sql` DDL 작성, DB 적용 |
| 260515 | PK 순서 `(key, group_name)` → `(group_name, key)` 변경 |
| 260515 | `google / map` API 키 초기 데이터 INSERT |

---

## 테이블 구조

```
PK: (group_name, key)   ← super-key 기준: group이 달라야 key 중복 허용
```

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `group_name` | VARCHAR(100) | 그룹 분류 (예: google, kakao, internal, feature_flag) |
| `key` | VARCHAR(200) | 설정 키 |
| `value` | TEXT | 설정 값 |
| `description` | TEXT | 키 용도 설명 |
| `created_at` | TIMESTAMPTZ | 생성일 |
| `updated_at` | TIMESTAMPTZ | 수정일 |

---

## 데이터 조회 방법

### psql (직접 조회)

```bash
# 전체 조회
psql -h localhost -p 5435 -U saigon -d saigon_rider \
  -c "SELECT group_name, key, value FROM app_config ORDER BY group_name, key;"

# 특정 그룹 조회 (예: google)
psql -h localhost -p 5435 -U saigon -d saigon_rider \
  -c "SELECT key, value FROM app_config WHERE group_name = 'google';"

# 특정 키 단건 조회
psql -h localhost -p 5435 -U saigon -d saigon_rider \
  -c "SELECT value FROM app_config WHERE group_name = 'google' AND key = 'map';"
```

### Docker exec 경유 (컨테이너 내부)

```bash
docker exec saigon_db psql -U wellconn -d saigon_rider \
  -c "SELECT value FROM app_config WHERE group_name = 'google' AND key = 'map';"
```

### SQLAlchemy (BFF 내부 사용)

```python
from sqlalchemy import select
from app.models import AppConfig

async def get_config(db: AsyncSession, group: str, key: str) -> str | None:
    row = await db.scalar(
        select(AppConfig.value)
        .where(AppConfig.group_name == group, AppConfig.key == key)
    )
    return row

# 사용 예시
api_key = await get_config(db, "google", "map")
```

### 그룹 전체 딕셔너리로 로드

```python
from sqlalchemy import select
from app.models import AppConfig

async def get_config_group(db: AsyncSession, group: str) -> dict[str, str]:
    rows = await db.execute(
        select(AppConfig.key, AppConfig.value)
        .where(AppConfig.group_name == group)
    )
    return {row.key: row.value for row in rows}

# 사용 예시
google_cfg = await get_config_group(db, "google")
api_key = google_cfg.get("map")
```

---

## 현재 저장된 데이터

| group_name | key | description |
|---|---|---|
| `google` | `map` | Google Maps Platform API Key |

---

## INSERT 패턴 (추가 시 참고)

```sql
INSERT INTO app_config (group_name, key, value, description)
VALUES ('kakao', 'rest_api', 'YOUR_KEY', 'Kakao REST API Key')
ON CONFLICT (group_name, key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();
```

> `ON CONFLICT ... DO UPDATE` 패턴을 사용하면 중복 삽입 없이 upsert 가능.

---

## SQLAlchemy 모델 (미구현 — 필요 시 추가)

`backend/app/models.py`에 아직 `AppConfig` 모델이 없습니다.  
BFF에서 읽기 기능이 필요해지면 아래 모델을 추가하세요.

```python
class AppConfig(Base):
    __tablename__ = "app_config"
    group_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
```
