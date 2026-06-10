import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base_class import Base


class IncidentCase(Base):
    __tablename__ = "incident_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    impact_scope = Column(Text, nullable=True)
    root_cause_summary = Column(Text, nullable=True)
    action_summary = Column(Text, nullable=True)
    tags = Column(JSONB, nullable=False, default=list)
    sanitizable = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
