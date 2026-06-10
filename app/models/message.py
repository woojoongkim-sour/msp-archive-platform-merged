import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime, Enum, ForeignKey, func
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
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")
