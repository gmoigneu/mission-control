import math
import sys
import types

import pytest

from app.config import settings
from app.search import embedder
from app.search.embedder import embed_text, embed_texts


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def test_embed_text_length():
    vec = await embed_text("hello world")
    assert len(vec) == settings.embeddings_dim


async def test_embed_text_deterministic():
    text = "mission control platform"
    vec1 = await embed_text(text)
    vec2 = await embed_text(text)
    assert vec1 == vec2


async def test_embed_texts_batch():
    texts = ["hello world", "goodbye world"]
    vecs = await embed_texts(texts)
    assert len(vecs) == 2
    assert all(len(v) == settings.embeddings_dim for v in vecs)


async def test_related_texts_more_similar_than_unrelated():
    # "python backend engineer" and "python engineer" share tokens → high similarity
    # "python backend engineer" and "quarterly revenue forecast" share no tokens → low similarity
    text_a = "python backend engineer"
    text_related = "python engineer"
    text_unrelated = "quarterly revenue forecast"

    vec_a = await embed_text(text_a)
    vec_related = await embed_text(text_related)
    vec_unrelated = await embed_text(text_unrelated)

    sim_related = cosine_similarity(vec_a, vec_related)
    sim_unrelated = cosine_similarity(vec_a, vec_unrelated)

    assert sim_related > sim_unrelated, (
        f"Expected related similarity ({sim_related:.3f}) > unrelated ({sim_unrelated:.3f})"
    )


def _install_fake_openai(monkeypatch, captured):
    """Install a stub `openai` module so the lazy import in the provider resolves
    to a fully mocked AsyncOpenAI client — no network, no real dependency."""

    class _Embeddings:
        async def create(self, **kwargs):
            captured.update(kwargs)
            data = [
                types.SimpleNamespace(embedding=[float(i)] * settings.embeddings_dim)
                for i, _ in enumerate(kwargs["input"])
            ]
            return types.SimpleNamespace(data=data)

    class _AsyncOpenAI:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs
            self.embeddings = _Embeddings()

    fake_module = types.ModuleType("openai")
    fake_module.AsyncOpenAI = _AsyncOpenAI
    monkeypatch.setitem(sys.modules, "openai", fake_module)
    return captured


async def test_openai_provider_builds_request_and_maps_response(monkeypatch):
    captured: dict = {}
    _install_fake_openai(monkeypatch, captured)
    monkeypatch.setattr(settings, "embeddings_provider", "openai")
    monkeypatch.setattr(settings, "embeddings_model", "text-embedding-3-small")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-key")

    vecs = await embed_texts(["alpha", "beta"])

    # Request was built from settings.
    assert captured["client_kwargs"] == {"api_key": "sk-test-key"}
    assert captured["model"] == "text-embedding-3-small"
    assert captured["input"] == ["alpha", "beta"]
    assert captured["dimensions"] == settings.embeddings_dim

    # Response mapped to one vector per input, each of the configured dimension.
    assert len(vecs) == 2
    assert all(len(v) == settings.embeddings_dim for v in vecs)
    assert vecs[0][0] == 0.0
    assert vecs[1][0] == 1.0


async def test_openai_provider_requires_api_key(monkeypatch):
    monkeypatch.setattr(settings, "embeddings_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        await embed_text("hello")


async def test_fake_remains_default_provider():
    # The default provider must stay "fake" so the suite/offline use needs no API.
    assert embedder.settings.embeddings_provider == "fake"
