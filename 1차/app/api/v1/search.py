from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.retrieval import hybrid_search

router = APIRouter()


# ── 스키마 ─────────────────────────────────────────────────────

class SearchFilters(BaseModel):
    doc_type: str | None = None
    processing_status: str | None = None


class SearchRequest(BaseModel):
    query: str
    customer_id: str | None = None
    filters: SearchFilters = SearchFilters()


class SearchResult(BaseModel):
    id: str
    title: str
    snippet: str | None
    matched_by: str  # "vector" | "keyword" | "metadata"
    protection_type: str
    processing_status: str
    searchable_scope: str
    customer_id: str | None
    doc_type: str | None
    created_at: datetime
    limitation_notice: str | None


class SearchResponse(BaseModel):
    results: list[SearchResult]


# ── 헬퍼 ───────────────────────────────────────────────────────

def _limitation_notice(doc: Document) -> str | None:
    if doc.processing_status == "blocked":
        return "보호 문서: 메타데이터만 조회 가능"
    if doc.searchable_scope == "metadata_only":
        return "인덱싱 미완료: 메타데이터만 조회 가능"
    return None


def _result_from_doc(doc: Document, matched_by: str = "metadata", snippet: str | None = None) -> SearchResult:
    return SearchResult(
        id=str(doc.id),
        title=doc.title,
        snippet=snippet,
        matched_by=matched_by,
        protection_type=doc.protection_type,
        processing_status=doc.processing_status,
        searchable_scope=doc.searchable_scope,
        customer_id=doc.customer_id,
        doc_type=doc.doc_type,
        created_at=doc.created_at,
        limitation_notice=_limitation_notice(doc),
    )


# ── 엔드포인트 ─────────────────────────────────────────────────

@router.post("/search", response_model=SearchResponse)
def search_documents(req: SearchRequest, db: Session = Depends(get_db)):
    """
    통합 검색 API.
    - searchable_scope=full 문서: hybrid_search() 사용 → snippet 포함
    - 나머지 문서: Document 메타데이터 쿼리 (customer_id, doc_type 필터 적용)
    - 두 결과 병합 후 중복 제거
    """
    seen_ids: set[str] = set()
    results: list[SearchResult] = []

    # 1. searchable_scope=full 문서 — 벡터/키워드 하이브리드 검색
    chunks: list[DocumentChunk] = hybrid_search(req.query, db, top_k=20)
    for chunk in chunks:
        doc = chunk.document
        if doc is None:
            continue
        # customer_id 필터
        if req.customer_id and doc.customer_id != req.customer_id:
            continue
        # doc_type 필터
        if req.filters.doc_type and doc.doc_type != req.filters.doc_type:
            continue
        # processing_status 필터
        if req.filters.processing_status and doc.processing_status != req.filters.processing_status:
            continue

        doc_id_str = str(doc.id)
        if doc_id_str in seen_ids:
            continue
        seen_ids.add(doc_id_str)

        snippet = chunk.content[:200] if chunk.content else None
        results.append(_result_from_doc(doc, matched_by="vector", snippet=snippet))

    # 2. 나머지 문서 — 메타데이터 쿼리 (scope != full 포함)
    q = db.query(Document).filter(Document.searchable_scope != "full")
    if req.customer_id:
        q = q.filter(Document.customer_id == req.customer_id)
    if req.filters.doc_type:
        q = q.filter(Document.doc_type == req.filters.doc_type)
    if req.filters.processing_status:
        q = q.filter(Document.processing_status == req.filters.processing_status)

    for doc in q.order_by(Document.created_at.desc()).limit(50).all():
        doc_id_str = str(doc.id)
        if doc_id_str in seen_ids:
            continue
        seen_ids.add(doc_id_str)
        results.append(_result_from_doc(doc, matched_by="metadata", snippet=None))

    return SearchResponse(results=results)
