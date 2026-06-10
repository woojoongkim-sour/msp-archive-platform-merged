"""
Adaptive Agentic RAG — Simple / Complex 자동 라우팅
Session은 sync SQLAlchemy Session을 사용합니다.
"""
import logging
import os
from typing import AsyncIterator
from sqlalchemy.orm import Session

from app.services.retrieval import hybrid_search
from app.services.llm import generate_stream, classify_query_complexity

logger = logging.getLogger(__name__)

ESCALATION_THRESHOLD = float(os.getenv("ESCALATION_SCORE_THRESHOLD", "0.3"))


async def adaptive_rag(
    session: Session,
    query: str,
    customer_id: str | None,
    search_mode: str,
    conversation_history: list[dict],
) -> AsyncIterator[dict]:
    """
    Adaptive 라우팅: Simple → (결과 부족 시) Complex 에스컬레이션
    Yields SSE event dicts.
    """
    # 1. 질의 복잡도 분류
    classification = await classify_query_complexity(query)
    route_type = classification.get("type", "simple")
    route_reason = classification.get("reason", "")

    yield {"event": "routing", "data": {"type": route_type, "reason": route_reason}}

    # 2. 검색 (customer_id 기반 필터)
    search_customer = customer_id if search_mode == "single" else None

    if route_type == "complex":
        yield {
            "event": "agent_step",
            "data": {"step": 1, "tool": "hybrid_search", "status": "executing",
                     "description": "하이브리드 검색 중..."},
        }

    results = hybrid_search(query, session, customer_id=search_customer)
    for r in results:
        r["tool"] = "hybrid_search"

    if route_type == "complex":
        yield {
            "event": "agent_step",
            "data": {"step": 1, "tool": "hybrid_search", "status": "completed",
                     "summary": f"{len(results)}건 발견"},
        }

    # 에스컬레이션 판단: simple이었어도 점수 부족이면 complex로 승격
    top_score = results[0]["dense_score"] if results else 0.0
    if route_type == "simple" and (not results or top_score < ESCALATION_THRESHOLD):
        route_type = "complex"
        yield {
            "event": "routing",
            "data": {
                "type": "complex",
                "reason": f"검색 결과 부족 (best dense={top_score:.2f}) — 크로스 검색 에스컬레이션",
            },
        }

    # 3. Complex 경로의 추가 단계 (cross_search)
    if route_type == "complex":
        if not results or top_score < ESCALATION_THRESHOLD:
            yield {
                "event": "agent_step",
                "data": {"step": 2, "tool": "cross_search", "status": "executing",
                         "description": "전체 고객사 크로스 검색 중..."},
            }
            cross = hybrid_search(query, session, customer_id=None, top_k=5)
            for r in cross:
                r["tool"] = "cross_search"

            existing_ids = {r["chunk_id"] for r in results}
            for r in cross:
                if r["chunk_id"] not in existing_ids:
                    results.append(r)
                    existing_ids.add(r["chunk_id"])

            yield {
                "event": "agent_step",
                "data": {"step": 2, "tool": "cross_search", "status": "completed",
                         "summary": f"총 {len(results)}건 확보"},
            }

    results = results[:10]

    # 4. LLM 스트리밍 답변
    full_content: list[str] = []
    async for token in generate_stream(
        messages=[{"role": "user", "content": query}],
        context_sources=results,
        conversation_history=conversation_history,
    ):
        full_content.append(token)
        yield {"event": "stream", "data": {"content": token}}

    # 5. 출처 정보
    source_items = [
        {
            "chunk_id": r["chunk_id"],
            "document_id": r["document_id"],
            "title": r["title"],
            "section_title": r.get("section_title"),
            "customer_name": r.get("customer_name"),
            "score": round(r["score"], 4),
            "dense_score": round(r["dense_score"], 4),
            "snippet": r["content"][:200] + "…" if len(r["content"]) > 200 else r["content"],
            "tool": r.get("tool"),
        }
        for r in results
    ]

    yield {"event": "sources", "data": {"sources": source_items}}

    yield {
        "event": "complete",
        "data": {
            "route_type": route_type,
            "tool_calls": 2 if route_type == "complex" else 1,
            "content": "".join(full_content),
            "sources": source_items,
        },
    }
