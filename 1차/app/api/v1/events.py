from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.event_occurrence import EventOccurrence
from app.models.event_state_history import EventStateHistory
from app.models.event_handling_record import EventHandlingRecord
from app.models.event_assessment import EventAssessment

router = APIRouter()


# ── 스키마 ─────────────────────────────────────────────────────

class EventCreate(BaseModel):
    customer_id: str
    source_system: str
    source_event_id: str | None = None
    event_name: str
    severity: str = "medium"
    host: str | None = None
    service: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    current_status: str = "open"
    raw_payload_reference: dict | None = None


class StateHistoryOut(BaseModel):
    id: UUID
    previous_state: str | None
    new_state: str
    changed_at: datetime
    changed_by: str | None
    source: str

    model_config = {"from_attributes": True}


class HandlingRecordOut(BaseModel):
    id: UUID
    action_type: str
    action_summary: str
    actor: str
    executed_at: datetime
    related_ticket: str | None
    result_status: str

    model_config = {"from_attributes": True}


class AssessmentOut(BaseModel):
    id: UUID
    recurrence_score: float | None
    risk_score: float | None
    pattern_summary: str | None
    probable_cause: str | None
    transfer_to_incident: bool
    analyzed_at: datetime
    analyzer_type: str

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: UUID
    customer_id: str
    source_system: str
    source_event_id: str | None
    event_name: str
    severity: str
    host: str | None
    service: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    current_status: str
    raw_payload_reference: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EventDetail(EventOut):
    state_histories: list[StateHistoryOut] = []
    handling_records: list[HandlingRecordOut] = []
    assessments: list[AssessmentOut] = []

    model_config = {"from_attributes": True}


# ── 엔드포인트 ─────────────────────────────────────────────────

@router.get("/events", response_model=list[EventOut])
def list_events(
    customer_id: str | None = None,
    severity: str | None = None,
    current_status: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """이벤트 목록 조회. 쿼리파라미터로 필터링."""
    q = db.query(EventOccurrence)
    if customer_id:
        q = q.filter(EventOccurrence.customer_id == customer_id)
    if severity:
        q = q.filter(EventOccurrence.severity == severity)
    if current_status:
        q = q.filter(EventOccurrence.current_status == current_status)
    return q.order_by(EventOccurrence.created_at.desc()).limit(limit).all()


@router.get("/events/{occurrence_id}", response_model=EventDetail)
def get_event(occurrence_id: UUID, db: Session = Depends(get_db)):
    """이벤트 상세 조회 (state_histories, handling_records, assessments 포함)."""
    event = (
        db.query(EventOccurrence)
        .options(
            joinedload(EventOccurrence.state_histories),
            joinedload(EventOccurrence.handling_records),
            joinedload(EventOccurrence.assessments),
        )
        .filter(EventOccurrence.id == occurrence_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")
    return event


@router.post("/events", status_code=201, response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    """새 이벤트 생성 (외부 시스템 webhook용)."""
    event = EventOccurrence(
        customer_id=payload.customer_id,
        source_system=payload.source_system,
        source_event_id=payload.source_event_id,
        event_name=payload.event_name,
        severity=payload.severity,
        host=payload.host,
        service=payload.service,
        first_seen_at=payload.first_seen_at,
        last_seen_at=payload.last_seen_at,
        current_status=payload.current_status,
        raw_payload_reference=payload.raw_payload_reference,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
