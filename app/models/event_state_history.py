import uuid
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class EventStateHistory(Base):
    __tablename__ = "event_state_histories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurrence_id = Column(UUID(as_uuid=True), ForeignKey("event_occurrences.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_state = Column(String, nullable=True)
    new_state = Column(String, nullable=False)
    changed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    changed_by = Column(String, nullable=True)
    source = Column(
        Enum("system", "operator", name="state_change_source_enum"),
        nullable=False, default="system",
    )

    occurrence = relationship("EventOccurrence", back_populates="state_histories")
