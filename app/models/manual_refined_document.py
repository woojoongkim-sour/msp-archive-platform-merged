import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class ManualRefinedDocument(Base):
    __tablename__ = "manual_refined_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    content = Column(Text, nullable=False)
    status = Column(
        Enum("draft", "pending_approval", "approved", "rejected", name="refined_doc_status_enum"),
        nullable=False, default="draft",
    )
    submitted_by = Column(String, nullable=False)
    approved_by = Column(String, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    document = relationship("Document", back_populates="refined_documents")
    chunks = relationship("DocumentChunk", back_populates="refined_document")
