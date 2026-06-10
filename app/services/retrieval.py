from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text

from app.models.document_chunk import DocumentChunk
from app.models.document import Document
from app.core.embedding import embed_query


def _indexed_chunks(db: Session):
    """인덱싱이 완료된 청크만 조회하는 기본 쿼리."""
    return (
        db.query(DocumentChunk)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(Document.indexing_status == "indexed")
        .options(joinedload(DocumentChunk.document))
    )


def dense_search(query: str, db: Session, top_k: int = 10) -> list[DocumentChunk]:
    query_vector = embed_query(query)
    return (
        _indexed_chunks(db)
        .order_by(DocumentChunk.dense_vector.cosine_distance(query_vector))
        .limit(top_k)
        .all()
    )


def sparse_search(query: str, db: Session, top_k: int = 10) -> list[DocumentChunk]:
    return (
        _indexed_chunks(db)
        .filter(text("document_chunks.content @@ :q").bindparams(q=query))
        .limit(top_k)
        .all()
    )


def hybrid_search(query: str, db: Session, top_k: int = 10, k: int = 60) -> list[DocumentChunk]:
    """Dense + Sparse 검색 결과를 RRF로 병합."""
    dense_results = dense_search(query, db, top_k=top_k)
    sparse_results = sparse_search(query, db, top_k=top_k)

    scores: dict = {}
    for i, chunk in enumerate(dense_results):
        scores.setdefault(chunk.id, {"score": 0.0, "chunk": chunk})
        scores[chunk.id]["score"] += 1 / (k + i)

    for i, chunk in enumerate(sparse_results):
        scores.setdefault(chunk.id, {"score": 0.0, "chunk": chunk})
        scores[chunk.id]["score"] += 1 / (k + i)

    sorted_items = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    return [item["chunk"] for item in sorted_items[:top_k]]
