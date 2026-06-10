import uuid
from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(String, nullable=True, index=True)
    owner = Column(String, nullable=True, index=True)  # 소유자 이메일
    title = Column(String, nullable=False)
    doc_type = Column(String, nullable=True)
    source = Column(String, nullable=True)
    file_format = Column(String, nullable=True)
    version = Column(String, nullable=True)
    status = Column(
        Enum("active", "inactive", name="document_status_enum"),
        nullable=False, default="active",
    )
    tags = Column(JSONB, nullable=False, default=list)

    file_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    file_hash = Column(String(64), unique=True, nullable=True)

    # PRD 2.9.1 보호/처리 메타데이터
    protection_type = Column(
        Enum("none", "password", "drm", "unknown", name="protection_type_enum"),
        nullable=False, default="unknown",
    )
    processing_status = Column(
        Enum(
            "pending", "processing", "completed",
            "blocked", "awaiting_manual_refinement", "failed",
            name="processing_status_enum",
        ),
        nullable=False, default="pending", index=True,
    )
    processing_capability = Column(
        Enum("full", "metadata_only", "refinement_only", name="processing_capability_enum"),
        nullable=False, default="metadata_only",
    )
    indexing_status = Column(
        Enum("not_indexed", "indexed", "failed", name="indexing_status_enum"),
        nullable=False, default="not_indexed",
    )
    searchable_scope = Column(
        Enum("full", "metadata_only", "none", name="searchable_scope_enum"),
        nullable=False, default="metadata_only",
    )
    relation_extractable = Column(Boolean, nullable=False, default=False)
    manual_refined_required = Column(Boolean, nullable=False, default=False)
    last_processing_attempt_at = Column(DateTime(timezone=True), nullable=True)
    processing_error_reason = Column(Text, nullable=True)

    # 문서 버전 관리
    version_group_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    is_latest = Column(Boolean, nullable=False, default=True)

    # 소스 유형 (file/email/zammad 등)
    source_type = Column(String(50), nullable=True, index=True)

    authored_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    refined_documents = relationship("ManualRefinedDocument", back_populates="document", cascade="all, delete-orphan")
    processing_attempts = relationship("DocumentProcessingAttempt", back_populates="document", cascade="all, delete-orphan")
