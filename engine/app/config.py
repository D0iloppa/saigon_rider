from pydantic_settings import BaseSettings, SettingsConfigDict


class SreSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # DB
    database_url: str

    # Service auth
    engine_service_key: str
    engine_admin_jwt_secret: str

    # SRE business rules
    sre_timezone: str = "Asia/Ho_Chi_Minh"
    sre_rp_expiry_months: int = 3
    sre_daily_cap_standard: int = 250
    sre_daily_cap_driver: int = 2000
    sre_new_account_penalty_days: int = 3
    sre_new_account_multiplier: float = 0.5
    sre_idempotency_ttl_days: int = 7
    sre_log_level: str = "INFO"
    sre_metrics_enabled: bool = True


settings = SreSettings()
