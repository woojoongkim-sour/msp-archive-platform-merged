import uuid
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.db.base_class import Base

# BAAI/bge-m3 기준 1024차원
EMBEDDING_DIM = 1024


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    refined_document_id = Column(UUID(as_uuid=True), ForeignKey("manual_refined_documents.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    embedding_source = Column(
        Enum("original", "refined", name="embedding_source_enum"),
        nullable=False, default="original",
    )
    dense_vector = Column(Vector(EMBEDDING_DIM), nullable=True)
    section_title = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    document = relationship("Document", back_populates="chunks")
    refined_document = relationship("ManualRefinedDocument", back_populates="chunks")
