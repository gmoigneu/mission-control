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
    """Real embeddings via the OpenAI API.

    `openai` is an optional dependency, lazy-imported here so the base install
    (and the offline test suite, which uses provider=fake) stays free of it.
    Install with `uv sync --extra openai` (or `uv add openai`) to enable.

    The API key is a standard `sk-...` secret-key credential (OPENAI_API_KEY) —
    this is unrelated to the ChatGPT-subscription Codex OAuth used by the agent.
    """
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai. "
            "Set a standard sk-... key (separate from the agent's ChatGPT OAuth)."
        )

    try:
        from openai import AsyncOpenAI
    except ImportError as exc:  # pragma: no cover - exercised only without the extra
        raise RuntimeError(
            "The 'openai' package is required when EMBEDDINGS_PROVIDER=openai. "
            "Install it with `uv sync --extra openai` (or `uv add openai`)."
        ) from exc

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(
        model=settings.embeddings_model,
        input=texts,
        dimensions=settings.embeddings_dim,
    )
    return [list(d.embedding) for d in resp.data]
