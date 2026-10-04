from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Fair Drop"
    environment: str = "development"
    database_url: str = "sqlite:///./fair_drop.db"
    redis_url: str = "redis://localhost:6379/0"
    redis_required: bool = False
    redis_reconnect_interval_seconds: float = 5.0
    hold_seconds: int = 120
    session_ttl_seconds: int = 1800
    queue_token_ttl_seconds: int = 300
    admission_window: int = 100
    admission_ttl_seconds: int = 900
    allocation_retry_attempts: int = 8
    rate_limit_window_seconds: int = 10
    rate_limit_requests: int = 100
    mutation_rate_limit_requests: int = 30
    mutation_rate_limit_window_seconds: int = 10
    queue_poll_rate_limit: int = 30
    queue_poll_window_seconds: int = 10
    hmac_secret: str = "CHANGE-ME-IN-PRODUCTION"
    allow_direct_allocation: bool = False
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    resilience_queue_depth_threshold: int = 5000
    resilience_rate_threshold: int = 1000
    resilience_error_elevated: float = 0.05
    resilience_error_degraded: float = 0.10
    resilience_error_protective: float = 0.25
    log_level: str = "INFO"
    api_workers: int = 2
    enable_expiry_worker: bool = True
    expiry_worker_interval_seconds: int = 5

    # --- Deterministic policy (consumes Person 2 RiskEvents; ML never mutates inventory/queue) ---
    policy_version: str = "policy-v1"
    policy_challenge_risk: float = 0.50
    policy_throttle_risk: float = 0.75
    policy_quarantine_risk: float = 0.90
    policy_reject_risk: float = 0.99
    policy_anomaly_challenge: float = 0.80
    policy_coordination_threshold: float = 0.90
    policy_corroboration_risk: float = 0.50
    policy_corroboration_anomaly: float = 0.80
    policy_coordination_repeat_count: int = 2
    policy_campaign_min_sessions: int = 5
    policy_hard_evidence: str = "replayed_admission_token,forged_admission_token,credential_stuffing,known_bad_actor"
    policy_ttl_challenge_seconds: int = 900
    policy_ttl_throttle_seconds: int = 900
    policy_ttl_quarantine_seconds: int = 3600
    policy_ttl_reject_seconds: int = 86400
    policy_throttle_admit_interval_seconds: int = 20
    policy_challenge_difficulty_bits: int = 16
    policy_challenge_ttl_seconds: int = 300
    admin_api_key: str = ""  # when set, /admin/*, event creation and inventory seeding require X-Admin-Key
    integration_api_key: str = ""  # when set, /integration/* and /policy/decisions require X-Integration-Key
    ml_api_url: str = ""
    ml_api_timeout_seconds: float = 2.0
    ml_sync_interval_seconds: int = 0  # >0 (with ML_API_URL) enables the background RiskEvent pull-sync; 0 = admin-triggered only

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
