import uuid
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(
        Enum("user", "assistant", name="message_role_enum"),
        nullable=False,
    )
    content = Column(Text, nullable=False)
    source_nodes = Column(JSONB, nullable=True)       # 참조된 chunk ID 목록
    evidence = Column(JSONB, nullable=True)            # 근거 항목 (type, id, title, snippet)
    limitation_notice = Column(Text, nullable=True)    # 보호문서 제한 사유
    requires_manual_confirmation = Column(Boolean, nullable=False, default=False)
    # Adaptive RAG 추가 필드
    sources = Column(JSONB, nullable=True)             # 출처 목록 (chunk_id, title, snippet 등)
    route_type = Column(String(20), nullable=True)     # "simple" | "complex"
    feedback = Column(String(10), nullable=True)       # "up" | "down"
    tool_calls = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")
