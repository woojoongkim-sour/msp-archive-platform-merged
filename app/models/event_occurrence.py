import uuid
from sqlalchemy import Column, String, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class EventOccurrence(Base):
    __tablename__ = "event_occurrences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(String, nullable=False, index=True)
    source_system = Column(String, nullable=False)
    source_event_id = Column(String, nullable=True)
    event_name = Column(String, nullable=False)
    severity = Column(
        Enum("critical", "high", "medium", "low", "info", name="event_severity_enum"),
        nullable=False, default="medium",
    )
    host = Column(String, nullable=True)
    service = Column(String, nullable=True)
    first_seen_at = Column(DateTime(timezone=True), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=False)
    current_status = Column(
        Enum("open", "acknowledged", "resolved", "closed", name="event_status_enum"),
        nullable=False, default="open", index=True,
    )
    raw_payload_reference = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    state_histories = relationship("EventStateHistory", back_populates="occurrence", cascade="all, delete-orphan")
    handling_records = relationship("EventHandlingRecord", back_populates="occurrence", cascade="all, delete-orphan")
    assessments = relationship("EventAssessment", back_populates="occurrence", cascade="all, delete-orphan")
    metric_log_evidences = relationship("MetricLogEvidence", back_populates="occurrence", cascade="all, delete-orphan")
