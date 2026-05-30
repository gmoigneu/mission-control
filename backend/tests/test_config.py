from app.config import Settings


def test_settings_defaults():
    s = Settings()
    assert s.database_url.startswith("postgresql+asyncpg://")
    assert s.environment == "development"


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SESSION_SECRET", "xyz")
    s = Settings()
    assert s.environment == "production"
    assert s.session_secret == "xyz"
