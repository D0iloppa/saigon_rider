# Saigon Rider Reward Engine — Mermaid ERD (PostgreSQL)

- **대상 DBMS**: PostgreSQL 14+
- **시간 타입**: `timestamptz` (밀리초 정밀도, 타임존 보존)
- **JSON 타입**: `jsonb` (인덱싱·연산자 지원)
- **소수 타입**: `numeric`

```mermaid
erDiagram
    SRE_USER ||--|| RP_BALANCE : holds
    SRE_USER ||--o{ RP_TRANSACTION : has
    SRE_USER ||--o{ ACTION_EVENT : produces
    SRE_USER ||--o{ USER_MISSION_PROGRESS : tracks
    SRE_USER ||--o{ MISSION_RECOMMENDATION : receives
    SRE_USER ||--o{ BEHAVIOR_CATEGORY_LOG : logs
    SRE_USER ||--|| USER_DIVERSITY_SCORE : has
    SRE_USER ||--|| USER_TIER : has
    SRE_USER ||--o{ REWARD_REDEMPTION : redeems
    SRE_USER ||--o{ ABUSE_EVENT : flagged
    SRE_USER ||--o{ RP_EXPIRATION_SCHEDULE : has

    ACTION_DEFINITION ||--o{ ACTION_EVENT : typed
    ACTION_DEFINITION ||--o{ MISSION_DEFINITION : referenced

    ACTION_EVENT ||--o{ RP_TRANSACTION : triggers
    ACTION_EVENT ||--o{ BEHAVIOR_CATEGORY_LOG : classified

    MISSION_DEFINITION ||--o{ USER_MISSION_PROGRESS : assigned
    MISSION_DEFINITION ||--o{ MISSION_RECOMMENDATION : suggests
    USER_MISSION_PROGRESS ||--o{ RP_TRANSACTION : awards

    RP_TRANSACTION ||--o{ AUDIT_LOG : audited
    RP_TRANSACTION ||--o{ RP_EXPIRATION_SCHEDULE : scheduled

    REWARD_PARTNER ||--o{ REWARD_CATALOG : supplies
    REWARD_CATALOG ||--o{ REWARD_REDEMPTION : ordered
    REWARD_REDEMPTION ||--|| RP_TRANSACTION : pays_with
    REWARD_REDEMPTION ||--o{ AUDIT_LOG : audited

    TIER_DEFINITION ||--o{ USER_TIER : defines
    USER_DIVERSITY_SCORE }o--|| USER_TIER : influences

    ABUSE_RULE ||--o{ ABUSE_EVENT : triggers
    ABUSE_EVENT ||--o{ AUDIT_LOG : audited

    IDEMPOTENCY_KEY ||--o| ACTION_EVENT : guards
    IDEMPOTENCY_KEY ||--o| REWARD_REDEMPTION : guards

    SRE_USER {
        bigint user_id PK
        varchar external_user_uuid UK
        account_type_enum account_type
        boolean is_driver_verified
        user_status_enum status
        timestamptz created_at
    }

    ACTION_DEFINITION {
        varchar action_code PK
        varchar category_code
        varchar display_name
        int base_rp
        int daily_count_limit
        boolean is_active
        jsonb metadata_schema
        timestamptz updated_at
    }

    ACTION_EVENT {
        bigint event_id PK
        bigint user_id FK
        varchar action_code FK
        timestamptz occurred_at
        jsonb payload
        varchar idempotency_key UK
        numeric calculated_rp
        numeric applied_multiplier
        event_status_enum process_status
        varchar reject_reason_code
        timestamptz created_at
    }

    MISSION_DEFINITION {
        bigint mission_id PK
        varchar mission_code UK
        varchar title
        varchar description
        varchar category_code
        jsonb target_rule
        int reward_rp
        int duration_hours
        boolean is_repeatable
        timestamptz starts_at
        timestamptz ends_at
        boolean is_active
    }

    USER_MISSION_PROGRESS {
        bigint progress_id PK
        bigint user_id FK
        bigint mission_id FK
        int current_value
        int target_value
        mission_status_enum status
        timestamptz started_at
        timestamptz completed_at
        timestamptz expires_at
    }

    MISSION_RECOMMENDATION {
        bigint rec_id PK
        bigint user_id FK
        bigint mission_id FK
        numeric score
        varchar reason_code
        timestamptz recommended_at
        timestamptz consumed_at
    }

    RP_BALANCE {
        bigint user_id PK,FK
        bigint current_balance
        bigint lifetime_earned
        bigint lifetime_spent
        bigint expiring_soon
        timestamptz last_recalculated_at
    }

    RP_TRANSACTION {
        bigint transaction_id PK
        bigint user_id FK
        tx_type_enum tx_type
        bigint amount
        bigint balance_after
        varchar source_type
        bigint source_id
        bigint related_event_id FK
        timestamptz occurred_at
        timestamptz expires_at
        varchar memo
    }

    RP_EXPIRATION_SCHEDULE {
        bigint expire_id PK
        bigint user_id FK
        bigint source_transaction_id FK
        bigint remaining_amount
        timestamptz expires_at
        expire_status_enum status
    }

    BEHAVIOR_CATEGORY_LOG {
        bigint log_id PK
        bigint user_id FK
        varchar category_code
        bigint related_event_id FK
        timestamptz occurred_at
        int month_key
    }

    USER_DIVERSITY_SCORE {
        bigint user_id PK,FK
        int month_key PK
        int active_category_count
        numeric multiplier
        timestamptz last_calculated_at
    }

    TIER_DEFINITION {
        varchar tier_code PK
        varchar tier_name
        bigint min_lifetime_rp
        int min_diversity_count
        int sort_order
    }

    USER_TIER {
        bigint user_id PK,FK
        varchar current_tier_code FK
        bigint progress_to_next
        timestamptz achieved_at
    }

    REWARD_PARTNER {
        bigint partner_id PK
        varchar partner_code UK
        varchar partner_name
        integration_type_enum integration_type
        jsonb api_config
        boolean is_active
        timestamptz created_at
    }

    REWARD_CATALOG {
        bigint catalog_id PK
        bigint partner_id FK
        varchar item_code UK
        varchar item_name
        varchar category_code
        int required_rp
        int face_value_vnd
        int monthly_quota
        int monthly_issued
        boolean is_active
        timestamptz visible_from
        timestamptz visible_until
    }

    REWARD_REDEMPTION {
        bigint redemption_id PK
        bigint user_id FK
        bigint catalog_id FK
        bigint rp_transaction_id FK
        redemption_status_enum status
        varchar voucher_code
        jsonb external_response
        varchar idempotency_key UK
        timestamptz requested_at
        timestamptz fulfilled_at
        timestamptz expires_at
    }

    ABUSE_RULE {
        varchar rule_code PK
        varchar rule_name
        abuse_severity_enum severity
        jsonb condition_json
        abuse_action_enum action
        boolean is_active
    }

    ABUSE_EVENT {
        bigint abuse_event_id PK
        bigint user_id FK
        varchar rule_code FK
        bigint related_event_id FK
        jsonb detail
        abuse_action_enum action_taken
        timestamptz detected_at
    }

    IDEMPOTENCY_KEY {
        varchar idempotency_key PK
        varchar resource_type
        bigint resource_id
        timestamptz created_at
        timestamptz expires_at
    }

    AUDIT_LOG {
        bigint audit_id PK
        varchar entity_type
        bigint entity_id
        bigint actor_user_id
        varchar action_code
        jsonb before_snapshot
        jsonb after_snapshot
        timestamptz created_at
    }
```

## PostgreSQL ENUM 타입

DDL에서 정의한 ENUM 타입은 다음과 같이 매핑됩니다.

| ENUM 타입 | 사용 컬럼 | 값 |
|---|---|---|
| `account_type_enum` | `sre_user.account_type` | `STANDARD`, `DRIVER`, `BUSINESS` |
| `user_status_enum` | `sre_user.status` | `ACTIVE`, `SUSPENDED`, `DELETED` |
| `event_status_enum` | `action_event.process_status` | `PENDING`, `PROCESSED`, `REJECTED`, `REFUNDED` |
| `mission_status_enum` | `user_mission_progress.status` | `ACTIVE`, `COMPLETED`, `EXPIRED`, `CANCELLED` |
| `tx_type_enum` | `rp_transaction.tx_type` | `EARN`, `REDEEM`, `EXPIRE`, `ADJUST_PLUS`, `ADJUST_MINUS`, `REFUND` |
| `expire_status_enum` | `rp_expiration_schedule.status` | `PENDING`, `PARTIALLY_USED`, `EXPIRED`, `FULLY_USED` |
| `integration_type_enum` | `reward_partner.integration_type` | `INTERNAL`, `GOTIT`, `URBOX`, `TELCO`, `MANUAL` |
| `redemption_status_enum` | `reward_redemption.status` | `REQUESTED`, `FULFILLED`, `FAILED`, `REFUNDED`, `CANCELLED` |
| `abuse_severity_enum` | `abuse_rule.severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `abuse_action_enum` | `abuse_rule.action`, `abuse_event.action_taken` | `LOG`, `REDUCE`, `REJECT`, `SUSPEND` |

## 도메인 그룹 색깔 가이드 (시각화 시 참고)

- 🟦 **사용자 식별**: SRE_USER
- 🟩 **이벤트 / 행동**: ACTION_DEFINITION, ACTION_EVENT, BEHAVIOR_CATEGORY_LOG
- 🟨 **미션**: MISSION_DEFINITION, USER_MISSION_PROGRESS, MISSION_RECOMMENDATION
- 🟧 **포인트 원장**: RP_BALANCE, RP_TRANSACTION, RP_EXPIRATION_SCHEDULE
- 🟪 **다양성 / 등급**: USER_DIVERSITY_SCORE, TIER_DEFINITION, USER_TIER
- 🟥 **보상**: REWARD_PARTNER, REWARD_CATALOG, REWARD_REDEMPTION
- ⬛ **보안 / 감사**: ABUSE_RULE, ABUSE_EVENT, IDEMPOTENCY_KEY, AUDIT_LOG

## 변경 요약 (MySQL → PostgreSQL)

| MySQL | PostgreSQL | 비고 |
|---|---|---|
| `datetime` | `timestamptz` | 타임존 보존이 필요 없으면 `timestamp`도 가능 |
| `json` | `jsonb` | 인덱싱·연산자 지원 |
| `decimal` | `numeric` | PostgreSQL 표준 명칭 |
| `enum` (인라인) | 명명된 ENUM 타입 | DDL 상단에서 `CREATE TYPE`으로 정의 후 재사용 |
| `abuse_rule.condition` | `abuse_rule.condition_json` | DDL 실제 컬럼명과 일치 |
