import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class EventHandlingRecord(Base):
    __tablename__ = "event_handling_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurrence_id = Column(UUID(as_uuid=True), ForeignKey("event_occurrences.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String, nullable=False)  # diagnosis/mitigation/escalation/resolution
    action_summary = Column(Text, nullable=False)
    actor = Column(String, nullable=False)
    executed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    related_ticket = Column(String, nullable=True)
    result_status = Column(
        Enum("success", "failed", "partial", "pending", name="handling_result_enum"),
        nullable=False, default="pending",
    )

    occurrence = relationship("EventOccurrence", back_populates="handling_records")
