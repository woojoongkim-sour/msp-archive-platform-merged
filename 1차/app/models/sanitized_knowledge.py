import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base_class import Base


class SanitizedKnowledge(Base):
    __tablename__ = "sanitized_knowledges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(JSONB, nullable=False, default=list)
    approval_status = Column(
        Enum("pending", "approved", "rejected", name="knowledge_approval_enum"),
        nullable=False, default="pending", index=True,
    )
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
