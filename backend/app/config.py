from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc"
    test_database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc_test"
    session_secret: str = "dev-insecure-change-me"
    initial_user_email: str | None = None
    initial_user_password: str | None = None


settings = Settings()
