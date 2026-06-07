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
    if settings.embeddings_provider == "openrouter":
        return await _openrouter_embed(texts)
    return [_fake_embed(t, dim) for t in texts]


async def embed_text(text: str) -> list[float]:
    return (await embed_texts([text]))[0]


async def _openai_compatible_embed(
    texts: list[str],
    *,
    api_key: str | None,
    base_url: str | None,
    model: str,
    missing_key_msg: str,
) -> list[list[float]]:
    """Embed via any OpenAI-compatible ``/embeddings`` endpoint.

    Lazy-imports ``openai`` so the dependency only loads when a real provider is
    selected; the default ("fake") path stays import-free and fully offline.
    ``base_url=None`` targets OpenAI directly; pass OpenRouter's base URL to
    route through it.
    """
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:  # pragma: no cover - depends on optional install
        raise RuntimeError(
            "OpenAI-compatible embeddings require the 'openai' package. "
            "Install it with: uv add openai"
        ) from exc

    if not api_key:
        raise RuntimeError(missing_key_msg)

    # Omit base_url when targeting OpenAI directly so the call matches the SDK
    # default (and the existing offline test's fake client signature).
    kwargs: dict = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    client = AsyncOpenAI(**kwargs)
    resp = await client.embeddings.create(model=model, input=texts)
    return [d.embedding for d in resp.data]


async def _openai_embed(texts: list[str]) -> list[list[float]]:
    return await _openai_compatible_embed(
        texts,
        api_key=settings.openai_api_key,
        base_url=None,
        model=settings.embeddings_model,
        missing_key_msg=(
            "EMBEDDINGS_PROVIDER=openai requires OPENAI_API_KEY to be set. "
            "Use a standard 'sk-' embeddings key (the Codex/ChatGPT-subscription "
            "OAuth credential is chat-only and cannot create embeddings)."
        ),
    )


async def _openrouter_embed(texts: list[str]) -> list[list[float]]:
    return await _openai_compatible_embed(
        texts,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        model=settings.openrouter_embeddings_model,
        missing_key_msg="EMBEDDINGS_PROVIDER=openrouter requires OPENROUTER_API_KEY to be set.",
    )
