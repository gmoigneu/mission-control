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
    embeddings_dim: int = 1536
    embeddings_provider: str = "fake"
    embeddings_model: str = "text-embedding-3-small"
    openai_api_key: str | None = None
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "mc-neo4j-pw"

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
