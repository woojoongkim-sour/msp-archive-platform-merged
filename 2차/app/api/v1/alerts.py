"""
모니터링 알람 수신 → Archive 기반 조치 가이드 생성 API.
Zabbix/Grafana/관제 시스템이 POST하면 자동으로 대화가 생성되고 5섹션 조치 가이드가 기록됩니다.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.customer import Customer
from app.services.agent import adaptive_rag
from app.services.retrieval import hybrid_search

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRequest(BaseModel):
    host: str | None = None
    service: str | None = None
    severity: str | None = None
    message: str | None = None
    customer: str | None = None
    customer_code: str | None = None
    raw: str | None = None
    search_mode: str = "single"


def _build_query(a: AlertRequest) -> str:
    parts = []
    if a.customer:
        parts.append(f"고객사: {a.customer}")
    if a.host:
        parts.append(f"대상 서버/호스트: {a.host}")
    if a.service:
        parts.append(f"서비스/항목: {a.service}")
    if a.severity:
        parts.append(f"심각도: {a.severity}")
    if a.message:
        parts.append(f"알람 메시지: {a.message}")
    if a.raw and not a.message:
        parts.append(f"알람 원문: {a.raw}")
    alert_text = "\n".join(parts) if parts else (a.raw or "(내용 없는 알람)")

    host_focus = ""
    if a.host:
        host_focus = (
            f"\n\n[중점 검색 대상]\n"
            f"호스트 {a.host} 의 자원관리대장·구성도·운영매뉴얼·계정관리대장상의 "
            f"서버 정보를 우선 찾아라."
        )

    return (
        f"[모니터링 알람 발생]\n{alert_text}{host_focus}\n\n"
        "위 알람에 대해 정해진 답변 양식에 따라 원인 분석과 단계별 조치 방법, "
        "관련 서버 접속 정보, 비상 연락망, 최근 작업 이력, 장애 관련 최근 메일을 정리해줘."
    )


@router.post("/guide")
async def alert_guide(req: AlertRequest, db: Session = Depends(get_db)):
    if not any([req.host, req.service, req.message, req.raw]):
        raise HTTPException(400, "host/service/message/raw 중 최소 하나는 필요합니다.")

    # 고객사 자동 매칭 (code 또는 name/alias로 탐색)
    customer_code: str | None = req.customer_code
    if customer_code is None and req.customer:
        customers = db.query(Customer).filter_by(is_active=True).all()
        for c in customers:
            name_match = c.name in req.customer or req.customer in c.name
            code_match = c.code.lower() in req.customer.lower()
            alias_match = any(a.alias in req.customer or req.customer in a.alias
                              for a in (c.aliases or []))
            if name_match or code_match or alias_match:
                customer_code = c.code
                break

    # 알람 전용 대화 생성
    label = (req.service or req.message or "알람")[:25].strip()
    host_part = f" @ {req.host}" if req.host else ""
    conv = Conversation(
        customer_id=customer_code,
        title=f"알람 [{label}]{host_part}",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    # host 사전 검색 — 해당 IP/호스트 관련 문서 발췌를 query에 첨부
    host_extract = ""
    if req.host:
        try:
            hr = hybrid_search(req.host, db, customer_id=customer_code, top_k=5)
            host_lines = [
                f"- 출처 [{r.get('title','')[:50]}]: {(r.get('content') or '')[:400].replace(chr(10), ' ')}"
                for r in hr
                if req.host in (r.get("content") or "") or req.host in (r.get("title") or "")
            ]
            if host_lines:
                host_extract = (
                    "\n\n[호스트 매칭 발췌 — 서버 접속 정보 섹션에 우선 활용]\n"
                    + "\n".join(host_lines)
                )
        except Exception as e:
            logger.warning("host 사전 검색 실패: %s", e)

    # 비상연락망 사전 검색
    contact_extract = ""
    if customer_code:
        try:
            cr = hybrid_search(
                "비상연락망 담당자 연락처 책임자 에스컬레이션",
                db, customer_id=customer_code, top_k=3,
            )
            contact_lines = [
                f"- 출처 [{r.get('title','')[:50]}]: {(r.get('content') or '')[:600].replace(chr(10), ' ')}"
                for r in cr
            ]
            if contact_lines:
                contact_extract = (
                    "\n\n[비상연락망 문서 발췌 — 비상 연락망 섹션에 우선 활용]\n"
                    + "\n".join(contact_lines)
                )
        except Exception as e:
            logger.warning("비상연락망 사전 검색 실패: %s", e)

    query = _build_query(req) + host_extract + contact_extract
    db.add(Message(conversation_id=conv.id, role="user", content=query))
    db.commit()

    # RAG로 조치 가이드 생성 (스트리밍 이벤트를 모아 전체 텍스트로)
    # 별도 세션으로 RAG 실행 (streaming generator 사용)
    rag_db = SessionLocal()
    try:
        content: list[str] = []
        sources: list = []
        route_type = "simple"
        async for ev in adaptive_rag(
            session=rag_db,
            query=query,
            customer_id=customer_code,
            search_mode=req.search_mode,
            conversation_history=[],
        ):
            if ev["event"] == "stream":
                content.append(ev["data"].get("content", ""))
            elif ev["event"] == "sources":
                sources = ev["data"].get("sources", [])
            elif ev["event"] == "routing":
                route_type = ev["data"].get("type", "simple")
    except Exception as e:
        rag_db.close()
        raise HTTPException(500, f"가이드 생성 실패: {e}")
    finally:
        rag_db.close()

    guide = "".join(content)

    db.add(Message(
        conversation_id=conv.id,
        role="assistant",
        content=guide,
        sources=sources,
        route_type=route_type,
    ))
    db.commit()

    return {
        "success": True,
        "data": {
            "conversation_id": str(conv.id),
            "title": conv.title,
            "guide": guide,
            "sources": sources,
        },
    }
