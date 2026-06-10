import uuid
from sqlalchemy import Column, String, Float, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from app.db.base_class import Base


class DocumentRelation(Base):
    __tablename__ = "document_relations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_entity_type = Column(String, nullable=False)  # document/event/incident/service/server/customer
    source_entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    target_entity_type = Column(String, nullable=False)
    target_entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    relation_type = Column(String, nullable=False)  # related_to/belongs_to/caused_by/etc.
    source_type = Column(
        Enum("metadata", "manual", "auto", "external", name="relation_source_type_enum"),
        nullable=False, default="manual",
    )
    confidence = Column(Float, nullable=False, default=1.0)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
