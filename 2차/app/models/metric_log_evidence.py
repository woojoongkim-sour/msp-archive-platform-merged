import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class MetricLogEvidence(Base):
    __tablename__ = "metric_log_evidences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurrence_id = Column(UUID(as_uuid=True), ForeignKey("event_occurrences.id", ondelete="CASCADE"), nullable=False, index=True)
    evidence_type = Column(
        Enum("metric", "log", "trace", name="evidence_type_enum"),
        nullable=False,
    )
    summary = Column(Text, nullable=False)
    data_snapshot = Column(JSONB, nullable=True)
    source_reference = Column(String, nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    occurrence = relationship("EventOccurrence", back_populates="metric_log_evidences")
