from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text

from app.models.document_chunk import DocumentChunk
from app.models.document import Document
from app.core.embedding import embed_query


def _base_query(db: Session, customer_id: str | None = None):
    """인덱싱이 완료된 청크 기본 쿼리 (customer_id 필터 옵션)."""
    q = (
        db.query(DocumentChunk)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(Document.indexing_status == "indexed")
        .options(joinedload(DocumentChunk.document))
    )
    if customer_id:
        q = q.filter(Document.customer_id == customer_id)
    return q


def _dense_search_with_scores(
    query: str, db: Session, top_k: int = 10, customer_id: str | None = None
) -> list[tuple]:
    """Dense 검색: (DocumentChunk, cosine_distance) 튜플 리스트 반환."""
    query_vector = embed_query(query)
    dist_col = DocumentChunk.dense_vector.cosine_distance(query_vector).label("dist")
    q = (
        db.query(DocumentChunk, dist_col)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(Document.indexing_status == "indexed")
        .options(joinedload(DocumentChunk.document))
    )
    if customer_id:
        q = q.filter(Document.customer_id == customer_id)
    return q.order_by("dist").limit(top_k).all()


def _sparse_search(
    query: str, db: Session, top_k: int = 10, customer_id: str | None = None
) -> list[DocumentChunk]:
    """Sparse 검색: PGroonga 전문 검색."""
    return (
        _base_query(db, customer_id=customer_id)
        .filter(text("document_chunks.content @@ :q").bindparams(q=query))
        .limit(top_k)
        .all()
    )


def hybrid_search(
    query: str,
    db: Session,
    top_k: int = 10,
    k: int = 60,
    customer_id: str | None = None,
) -> list[dict]:
    """Dense + Sparse 검색 결과를 RRF로 병합하여 dict 리스트 반환."""
    dense_results = _dense_search_with_scores(query, db, top_k=top_k, customer_id=customer_id)
    sparse_results = _sparse_search(query, db, top_k=top_k, customer_id=customer_id)

    scores: dict = {}
    for i, (chunk, dist) in enumerate(dense_results):
        cid = str(chunk.id)
        dense_score = max(0.0, 1.0 - float(dist)) if dist is not None else 0.0
        scores.setdefault(cid, {"chunk": chunk, "score": 0.0, "dense_score": dense_score})
        scores[cid]["score"] += 1 / (k + i)

    for i, chunk in enumerate(sparse_results):
        cid = str(chunk.id)
        scores.setdefault(cid, {"chunk": chunk, "score": 0.0, "dense_score": 0.0})
        scores[cid]["score"] += 1 / (k + i)

    sorted_items = sorted(scores.values(), key=lambda x: x["score"], reverse=True)[:top_k]

    result = []
    for item in sorted_items:
        c = item["chunk"]
        doc = c.document
        result.append({
            "chunk_id": str(c.id),
            "document_id": str(c.document_id),
            "title": doc.title if doc else "",
            "section_title": getattr(c, "section_title", None),
            "content": c.content,
            "customer_name": doc.customer_id if doc else None,
            "score": item["score"],
            "dense_score": item["dense_score"],
        })

    return result


def cross_search(query: str, db: Session, top_k: int = 5) -> list[dict]:
    """전체 고객사 대상 크로스 검색."""
    return hybrid_search(query, db, top_k=top_k, customer_id=None)


# ── 기존 호환용 단순 검색 함수들 (레거시 API에서 사용) ──────────────

def dense_search(query: str, db: Session, top_k: int = 10) -> list[DocumentChunk]:
    rows = _dense_search_with_scores(query, db, top_k=top_k)
    return [chunk for chunk, _ in rows]


def sparse_search(query: str, db: Session, top_k: int = 10) -> list[DocumentChunk]:
    return _sparse_search(query, db, top_k=top_k)
