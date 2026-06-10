from __future__ import annotations

import os

import numpy as np
from huggingface_hub import InferenceClient

EMBEDDING_DIM = 1024  # BAAI/bge-m3
_MODEL_NAME = "BAAI/bge-m3"
_BATCH_SIZE = 32


def _get_client() -> InferenceClient:
    return InferenceClient(token=os.getenv("HF_TOKEN"))


def _to_sentence_embeddings(raw) -> np.ndarray:
    arr = np.array(raw, dtype=float)
    if arr.ndim == 3:  # (batch, seq_len, hidden) → mean pool
        arr = arr.mean(axis=1)
    return arr


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-10)


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = _get_client()
    results = []
    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i:i + _BATCH_SIZE]
        raw = client.feature_extraction(batch, model=_MODEL_NAME)
        results.extend(_normalize(_to_sentence_embeddings(raw)).tolist())
    return results


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
