from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class DocumentResponse(BaseModel):
    id: UUID
    title: str
    file_format: str | None
    processing_status: str
    indexing_status: str
    protection_type: str
    customer_id: str | None
    doc_type: str | None
    owner: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
