import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.agent import adaptive_rag

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateConversationRequest(BaseModel):
    customer_id: str | None = None
    search_mode: str = "single"
    title: str = "새 대화"


class SendMessageRequest(BaseModel):
    content: str


class UpdateConversationRequest(BaseModel):
    title: str


class FeedbackRequest(BaseModel):
    value: str  # "up" | "down"


@router.post("/conversations")
def create_conversation(req: CreateConversationRequest, db: Session = Depends(get_db)):
    conv = Conversation(
        customer_id=req.customer_id,
        search_mode=req.search_mode,
        title=req.title,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"success": True, "data": _conv_to_dict(conv)}


@router.get("/conversations")
def list_conversations(limit: int = 20, db: Session = Depends(get_db)):
    convs = (
        db.query(Conversation)
        .order_by(Conversation.updated_at.desc())
        .limit(limit)
        .all()
    )
    return {"success": True, "data": [_conv_to_dict(c) for c in convs]}


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: UUID, db: Session = Depends(get_db)):
    conv = db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
        .all()
    )
    return {
        "success": True,
        "data": {
            **_conv_to_dict(conv),
            "messages": [_msg_to_dict(m) for m in messages],
        },
    }


@router.patch("/conversations/{conv_id}")
def update_conversation(
    conv_id: UUID,
    req: UpdateConversationRequest,
    db: Session = Depends(get_db),
):
    conv = db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    title = req.title.strip()
    if not title:
        raise HTTPException(400, "제목은 비어 있을 수 없습니다.")
    conv.title = title[:100]
    db.commit()
    db.refresh(conv)
    return {"success": True, "data": _conv_to_dict(conv)}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: UUID, db: Session = Depends(get_db)):
    conv = db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    db.delete(conv)
    db.commit()
    return {"success": True, "data": {"message": "삭제되었습니다."}}


@router.post("/conversations/{conv_id}/messages")
async def send_message(
    conv_id: UUID,
    req: SendMessageRequest,
    db: Session = Depends(get_db),
):
    conv = db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")

    # 대화 이력 조회 (최근 20개)
    history_msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
        .limit(20)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    # 첫 메시지면 제목 자동 설정
    if not history and conv.title.strip() in ("", "새 대화"):
        first_line = req.content.strip().splitlines()[0] if req.content.strip() else "새 대화"
        conv.title = first_line[:40] + ("…" if len(first_line) > 40 else "")

    # 사용자 메시지 저장
    user_msg = Message(conversation_id=conv_id, role="user", content=req.content)
    db.add(user_msg)
    db.commit()

    # 스냅샷: 스트리밍 중 필요한 값들
    customer_id = conv.customer_id
    search_mode = getattr(conv, "search_mode", "single") or "single"

    async def event_stream():
        full_content: list = []
        final_sources: list = []
        route_type = "simple"
        tool_calls = 0

        stream_db = SessionLocal()
        try:
            async for event in adaptive_rag(
                session=stream_db,
                query=req.content,
                customer_id=customer_id,
                search_mode=search_mode,
                conversation_history=history,
            ):
                event_name = event["event"]
                data = event["data"]

                yield f"event: {event_name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

                if event_name == "stream":
                    full_content.append(data.get("content", ""))
                elif event_name == "sources":
                    final_sources = data.get("sources", [])
                elif event_name == "routing":
                    route_type = data.get("type", "simple")
                elif event_name == "complete":
                    tool_calls = data.get("tool_calls", 0)

        except Exception as e:
            logger.error("Adaptive RAG 오류: %s", e)
            yield f"event: error\ndata: {json.dumps({'code': 'AGENT_ERROR', 'message': str(e)})}\n\n"
            stream_db.close()
            return

        # 어시스턴트 응답 저장
        try:
            assistant_msg = Message(
                conversation_id=conv_id,
                role="assistant",
                content="".join(full_content),
                sources=final_sources,
                route_type=route_type,
                tool_calls=tool_calls,
            )
            stream_db.add(assistant_msg)
            stream_db.commit()
        except Exception as e:
            logger.error("어시스턴트 메시지 저장 실패: %s", e)
            stream_db.rollback()
        finally:
            stream_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/messages/{message_id}/feedback")
def feedback_message(
    message_id: UUID,
    req: FeedbackRequest,
    db: Session = Depends(get_db),
):
    msg = db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "메시지를 찾을 수 없습니다.")
    msg.feedback = req.value
    db.commit()
    return {"success": True, "data": {"message": "피드백이 저장되었습니다."}}


# ── 기존 호환용 단순 SSE 엔드포인트 ────────────────────────────────

@router.get("/completions")
async def chat_completions(
    message: str,
    customer_id: str | None = None,
    db: Session = Depends(get_db),
):
    """기존 호환용 단순 GET 스트리밍."""
    from app.services.retrieval import hybrid_search
    from app.services.llm import get_llm_stream

    async def _stream():
        chunks = hybrid_search(message, db, customer_id=customer_id, top_k=5)
        sources = [
            {"id": r["document_id"], "title": r["title"]}
            for r in chunks
        ]
        yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"
        async for token in get_llm_stream(message, chunks):
            yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


def _conv_to_dict(c: Conversation) -> dict:
    return {
        "id": str(c.id),
        "customer_id": c.customer_id,
        "title": c.title,
        "search_mode": getattr(c, "search_mode", "single"),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if getattr(c, "updated_at", None) else None,
    }


def _msg_to_dict(m: Message) -> dict:
    return {
        "id": str(m.id),
        "role": m.role,
        "content": m.content,
        "sources": getattr(m, "sources", None) or [],
        "route_type": getattr(m, "route_type", None),
        "feedback": getattr(m, "feedback", None),
        "tool_calls": getattr(m, "tool_calls", 0),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }
