from pydantic_settings import BaseSettings, SettingsConfigDict


class SreSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # DB
    database_url: str

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Service auth
    engine_service_key: str
    engine_admin_jwt_secret: str

    # BFF (cross-DB grant calls)
    bff_internal_url: str = "http://bff:8080"

    # Firebase / FCM
    firebase_credentials_json: str = "/app/firebase-credentials.json"
    fcm_push_history_ttl_days: int = 7

    # APNs 직접 전송 — iOS Live Activity 원격 갱신 전용 (ai-docs/task/active/260829_live_activity_task.md Phase 3).
    # 일반 알림은 FCM 경유(위) 그대로. Activity 푸시토큰은 FCM 으로 못 보내 .p8 로 APNs 에 직접 붙는다.
    # 키 파일은 커밋 금지(*.p8 gitignore) — engine/ 에 두면 ./engine:/app 마운트로 컨테이너에 보인다.
    apns_key_id: str = ""
    apns_team_id: str = ""
    apns_key_path: str = "/app/apns-key.p8"
    apns_bundle_id: str = "com.user.SaigonRiders"
    apns_use_sandbox: bool = False

    # SRE business rules
    sre_timezone: str = "Asia/Ho_Chi_Minh"
    sre_xp_expiry_months: int = 3
    sre_exp_per_level: int = 100
    sre_daily_cap_standard: int = 250
    sre_daily_cap_driver: int = 2000
    sre_new_account_penalty_days: int = 3
    sre_new_account_multiplier: float = 0.5
    sre_idempotency_ttl_days: int = 7
    sre_log_level: str = "INFO"
    sre_metrics_enabled: bool = True


settings = SreSettings()
