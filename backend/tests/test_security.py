from app.security import hash_password, verify_password


def test_hash_and_verify_roundtrip():
    h = hash_password("hunter2")
    assert h != "hunter2"
    assert verify_password("hunter2", h) is True


def test_verify_rejects_wrong_password():
    h = hash_password("hunter2")
    assert verify_password("wrong", h) is False


def test_verify_rejects_malformed_hash():
    assert verify_password("anything", "not-a-valid-argon2-hash") is False
