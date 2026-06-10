import uuid
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class DocumentProcessingAttempt(Base):
    __tablename__ = "document_processing_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    attempted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    result = Column(
        Enum("success", "failed", "skipped", name="processing_attempt_result_enum"),
        nullable=False,
    )
    error_reason = Column(Text, nullable=True)
    processor_version = Column(String, nullable=True)

    document = relationship("Document", back_populates="processing_attempts")
