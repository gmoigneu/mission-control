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


def test_default_provider_is_fake():
    """The offline default must stay 'fake' so the suite never hits the network."""
    assert settings.embeddings_provider == "fake"


async def test_openai_provider_requires_api_key(monkeypatch):
    monkeypatch.setattr(embedder.settings, "embeddings_provider", "openai")
    monkeypatch.setattr(embedder.settings, "openai_api_key", None)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        await embed_texts(["hello"])


async def test_openai_provider_calls_client(monkeypatch):
    """provider=openai routes through AsyncOpenAI; mocked so the test stays offline."""
    captured: dict = {}

    class _FakeEmbeddings:
        async def create(self, *, model, input):
            captured["model"] = model
            captured["input"] = input
            data = [types.SimpleNamespace(embedding=[0.1, 0.2, 0.3]) for _ in input]
            return types.SimpleNamespace(data=data)

    class _FakeAsyncOpenAI:
        def __init__(self, *, api_key):
            captured["api_key"] = api_key
            self.embeddings = _FakeEmbeddings()

    fake_openai = types.ModuleType("openai")
    fake_openai.AsyncOpenAI = _FakeAsyncOpenAI
    monkeypatch.setitem(sys.modules, "openai", fake_openai)
    monkeypatch.setattr(embedder.settings, "embeddings_provider", "openai")
    monkeypatch.setattr(embedder.settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(embedder.settings, "embeddings_model", "text-embedding-3-small")

    vecs = await embed_texts(["a", "b"])

    assert vecs == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]
    assert captured["api_key"] == "sk-test"
    assert captured["model"] == "text-embedding-3-small"
    assert captured["input"] == ["a", "b"]


async def test_openrouter_provider_requires_api_key(monkeypatch):
    monkeypatch.setattr(embedder.settings, "embeddings_provider", "openrouter")
    monkeypatch.setattr(embedder.settings, "openrouter_api_key", None)
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        await embed_texts(["hello"])


async def test_openrouter_provider_routes_through_base_url(monkeypatch):
    """provider=openrouter reuses AsyncOpenAI but with OpenRouter's base_url."""
    captured: dict = {}

    class _FakeEmbeddings:
        async def create(self, *, model, input):
            captured["model"] = model
            captured["input"] = input
            data = [types.SimpleNamespace(embedding=[0.4, 0.5, 0.6]) for _ in input]
            return types.SimpleNamespace(data=data)

    class _FakeAsyncOpenAI:
        def __init__(self, *, api_key, base_url=None):
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            self.embeddings = _FakeEmbeddings()

    fake_openai = types.ModuleType("openai")
    fake_openai.AsyncOpenAI = _FakeAsyncOpenAI
    monkeypatch.setitem(sys.modules, "openai", fake_openai)
    monkeypatch.setattr(embedder.settings, "embeddings_provider", "openrouter")
    monkeypatch.setattr(embedder.settings, "openrouter_api_key", "or-test")
    monkeypatch.setattr(embedder.settings, "openrouter_base_url", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(
        embedder.settings, "openrouter_embeddings_model", "openai/text-embedding-3-small"
    )

    vecs = await embed_texts(["a", "b"])

    assert vecs == [[0.4, 0.5, 0.6], [0.4, 0.5, 0.6]]
    assert captured["api_key"] == "or-test"
    assert captured["base_url"] == "https://openrouter.ai/api/v1"
    assert captured["model"] == "openai/text-embedding-3-small"
    assert captured["input"] == ["a", "b"]
