# 마이그레이션 번호 충돌 해결 (180→181)

## 변경 파일
- `database/init/180_keyword_alert_max_count.sql` → `database/init/181_keyword_alert_max_count.sql` (파일명 변경)
- `docker-compose.yml` (수정)

## Compose 등록 위치
- **Command**: 라인 271~278 (180 항목 뒤에 4줄 추가)
  ```yaml
  - "-f"
  - "/migrations/181_keyword_alert_max_count.sql"
  - "-c"
  - "INSERT INTO schema_migrations(version) VALUES (181) ON CONFLICT DO NOTHING;"
  ```
- **Volumes**: 라인 318 (180_marketplace_keyword_alerts_norm 항목 뒤에 1줄 추가)
  ```yaml
  - ./database/init/181_keyword_alert_max_count.sql:/migrations/181_keyword_alert_max_count.sql:ro
  ```

## 실측 검증 결과

### 1. schema_migrations 버전 확인
```sql
select version from schema_migrations order by version desc limit 3;
-- 결과: 181, 180, 179 ✓
```

### 2. app_config 데이터 확인
```sql
select * from app_config where group_name='market';
-- 결과: (keyword_alert_max_count | 20 | market | 키워드 알림 최대 개수...) ✓
```

### 3. API 엔드포인트 확인
```bash
curl -s http://localhost:18090/api/bff/app-config
-- 결과: {...,"keyword_alert_max_count":20,...} ✓
```

## 완료 상태
✓ 모든 목표 조건 충족
- 181 파일 존재
- docker-compose.yml 등록 완료
- schema_migrations에 version 181 기록
- app_config에 실제 데이터 적재
- API 응답 정상
