import pytest

from app.config import _INSECURE_DEFAULT, Settings


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


def test_insecure_default_in_dev_is_allowed():
    """C1 — the default secret is acceptable in development."""
    s = Settings(environment="development", session_secret=_INSECURE_DEFAULT)
    assert s.session_secret == _INSECURE_DEFAULT


def test_insecure_default_in_production_raises():
    """C1 — startup must fail if production uses the insecure default secret."""
    with pytest.raises(ValueError, match="SESSION_SECRET"):
        Settings(environment="production", session_secret=_INSECURE_DEFAULT)
