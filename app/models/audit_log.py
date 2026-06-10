import uuid
from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base_class import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action_type = Column(String, nullable=False, index=True)
    # e.g. document_upload / protection_detected / processing_failed /
    #      refinement_upload / refinement_approved / query / chat
    actor = Column(String, nullable=True)
    target_entity_type = Column(String, nullable=True)
    target_entity_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSONB, nullable=True)
    search_mode = Column(String, nullable=True)          # metadata / refined / vector
    protected_doc_limitation = Column(Boolean, nullable=True)
    sanitized_knowledge_used = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
