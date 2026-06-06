from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT = "dev-insecure-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc"
    test_database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc_test"
    session_secret: str = _INSECURE_DEFAULT
    initial_user_email: str | None = None
    initial_user_password: str | None = None
    # WebAuthn / passkeys. rp_id is the registrable domain (no scheme/port);
    # rp_origin is the full origin the browser reports. Defaults target local dev.
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "Mission Control"
    webauthn_rp_origin: str = "http://localhost:5173"
    embeddings_dim: int = 1536
    embeddings_provider: str = "fake"
    embeddings_model: str = "text-embedding-3-small"
    # Multi-chunk indexing: long bodies are split into overlapping windows so a
    # single large entity indexes as several chunks rather than one diluted one.
    search_chunk_size: int = 1200
    search_chunk_overlap: int = 200
    openai_api_key: str | None = None
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "mc-neo4j-pw"
    llm_provider: str = "mock"
    # Confirmed live against the ChatGPT-subscription Responses endpoint: the
    # "prolite"/Go plan exposes base models (gpt-5.5, gpt-5.2) but rejects every
    # Codex-specific variant (gpt-5*-codex) with a 400.
    llm_model: str = "gpt-5.5"
    openai_oauth_client_id: str = "app_EMoamEEZ73f0CkXaXp7hrann"
    openai_auth_base_url: str = "https://auth.openai.com"
    openai_token_url: str = "https://auth.openai.com/oauth/token"
    openai_device_usercode_url: str = "https://auth.openai.com/api/accounts/deviceauth/usercode"
    openai_device_token_url: str = "https://auth.openai.com/api/accounts/deviceauth/token"
    openai_device_verification_uri: str = "https://auth.openai.com/codex/device"
    openai_device_redirect_uri: str = "https://auth.openai.com/deviceauth/callback"
    openai_responses_url: str = "https://chatgpt.com/backend-api/codex/responses"
    openai_originator: str = "codex_cli_rs"  # confirm in the live smoke
    openai_user_agent: str = "mission-control-agent/0.1"  # confirm in the live smoke
    # ── OpenRouter provider (LLM_PROVIDER=openrouter) ────────────────────────
    # OpenAI-compatible Chat Completions. Requires an API key; the model and
    # base URL are env-overridable (OPENROUTER_MODEL / OPENROUTER_BASE_URL).
    openrouter_api_key: str | None = None
    openrouter_model: str = "deepseek/deepseek-v4-flash"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Sent as OpenRouter's recommended attribution headers on each request.
    openrouter_referer: str = "https://github.com/gmoigneu/mission-control"
    openrouter_title: str = "Mission Control"

    @model_validator(mode="after")
    def _require_secure_secret_in_prod(self) -> "Settings":
        if self.environment != "development" and self.session_secret == _INSECURE_DEFAULT:
            raise ValueError(
                "SESSION_SECRET must be changed from the insecure default when "
                "environment != 'development'. "
                "Generate: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return self


settings = Settings()
