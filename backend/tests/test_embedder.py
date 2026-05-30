import math

import pytest

from app.config import settings
from app.search.embedder import embed_text, embed_texts


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
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
