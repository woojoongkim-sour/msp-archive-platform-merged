import uuid
from sqlalchemy import Column, Float, Text, Boolean, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class EventAssessment(Base):
    __tablename__ = "event_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurrence_id = Column(UUID(as_uuid=True), ForeignKey("event_occurrences.id", ondelete="CASCADE"), nullable=False, index=True)
    recurrence_score = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)
    pattern_summary = Column(Text, nullable=True)
    probable_cause = Column(Text, nullable=True)
    transfer_to_incident = Column(Boolean, nullable=False, default=False)
    analyzed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    analyzer_type = Column(
        Enum("human", "llm", "rule", name="analyzer_type_enum"),
        nullable=False, default="llm",
    )

    occurrence = relationship("EventOccurrence", back_populates="assessments")
