import hashlib
import math

from app.config import settings


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if t]


def _fake_embed(text: str, dim: int) -> list[float]:
    """Deterministic token-hashing embedding. No semantic model, but documents
    sharing tokens with the query get higher cosine similarity — enough for the
    search plumbing to work and be tested without an external API."""
    vec = [0.0] * dim
    for token in _tokenize(text):
        h = int(hashlib.md5(token.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0 if (h >> 8) % 2 == 0 else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    dim = settings.embeddings_dim
    if settings.embeddings_provider == "openai":
        return await _openai_embed(texts)
    return [_fake_embed(t, dim) for t in texts]


async def embed_text(text: str) -> list[float]:
    return (await embed_texts([text]))[0]


async def _openai_embed(texts: list[str]) -> list[list[float]]:
    # Lazy import so the dependency only loads when provider=openai; this keeps
    # the default ("fake") path import-free and the test suite fully offline.
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:  # pragma: no cover - depends on optional install
        raise RuntimeError(
            "EMBEDDINGS_PROVIDER=openai requires the 'openai' package. "
            "Install it with: uv add openai"
        ) from exc

    if not settings.openai_api_key:
        raise RuntimeError(
            "EMBEDDINGS_PROVIDER=openai requires OPENAI_API_KEY to be set. "
            "Use a standard 'sk-' embeddings key (the Codex/ChatGPT-subscription "
            "OAuth credential is chat-only and cannot create embeddings)."
        )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(model=settings.embeddings_model, input=texts)
    return [d.embedding for d in resp.data]
