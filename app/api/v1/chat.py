import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.retrieval import hybrid_search
from app.services.llm import get_llm_stream

router = APIRouter()


async def _rag_stream(message: str, customer_id: str | None, db: Session):
    # 1. 하이브리드 검색
    chunks = hybrid_search(message, db, top_k=5)

    # 2. 소스 메타데이터 전송
    sources = []
    seen = set()
    for c in chunks:
        if c.document and c.document.id not in seen:
            seen.add(c.document.id)
            sources.append({
                "id": str(c.document.id),
                "title": c.document.title,
                "protection_type": c.document.protection_type,
                "processing_status": c.document.processing_status,
            })
    yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"

    # 3. LLM 스트리밍
    async for token in get_llm_stream(message, chunks):
        yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

    yield "data: [DONE]\n\n"


@router.get("/completions")
async def chat_completions(
    message: str = Query(..., min_length=1),
    customer_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return StreamingResponse(
        _rag_stream(message, customer_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
