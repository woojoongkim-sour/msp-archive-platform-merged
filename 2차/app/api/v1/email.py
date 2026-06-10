import json
import os
import re
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import decrypt_password
from app.db.session import get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.user import User
from app.models.user_mail_config import UserMailConfig
from app.services.email_fetcher import fetch_recent_emails
from app.services.data_processor import process_file, resolve_customer_id

router = APIRouter()

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

CUSTOMER_DOMAIN_MAP_PATH = os.getenv("CUSTOMER_DOMAIN_MAP_PATH", "/app/customer_domain_map.json")


# ── 스키마 ─────────────────────────────────────────────────────

class FetchResponse(BaseModel):
    fetched: int
    queued: int


class EmailTag(BaseModel):
    email_from: str | None = None
    email_to: str | None = None
    email_date: str | None = None
    email_message_id: str | None = None


class EmailListItem(BaseModel):
    id: str
    title: str
    customer_id: str | None
    processing_status: str
    created_at: str
    tags: EmailTag


class EmailDetailItem(BaseModel):
    id: str
    title: str
    customer_id: str | None
    processing_status: str
    created_at: str
    tags: EmailTag
    content: str | None


# ── 헬퍼 ───────────────────────────────────────────────────────

def _safe_message_id(message_id: str) -> str:
    safe = re.sub(r"[<>\"':/\\|?*\s]", "_", message_id)
    return safe[:100]


def _load_domain_map() -> dict:
    try:
        with open(CUSTOMER_DOMAIN_MAP_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _tags_from_doc(doc: Document) -> EmailTag:
    raw = doc.tags or {}
    if isinstance(raw, list):
        raw = {}
    return EmailTag(
        email_from=raw.get("email_from"),
        email_to=raw.get("email_to"),
        email_date=raw.get("email_date"),
        email_message_id=raw.get("email_message_id"),
    )


# ── 백그라운드 처리 ────────────────────────────────────────────

async def _process_email_item(email_data: dict) -> None:
    """단일 이메일을 EML 파일로 저장 후 process_file() 실행."""
    message_id = email_data.get("message_id", "unknown")
    safe_id = _safe_message_id(message_id)
    file_path = os.path.join(UPLOAD_DIR, f"email_{safe_id}.eml")

    try:
        with open(file_path, "wb") as f:
            f.write(email_data["raw_bytes"])
    except Exception as e:
        print(f"EML 저장 실패 ({message_id}): {e}")
        return

    from_addr = email_data.get("from_addr", "")
    to_addr   = email_data.get("to_addr", "")
    subject   = email_data.get("subject", "No Subject")
    date_str  = email_data.get("date")

    customer_id = resolve_customer_id(from_addr, subject=subject) if from_addr else None

    # to_addr에서 순수 이메일 주소 추출 (owner로 사용)
    import re as _re
    match = _re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', to_addr or "")
    owner = match.group(0).lower() if match else None

    await process_file(
        file_path=file_path,
        original_filename=f"{subject}.eml",
        customer_id=customer_id,
        doc_type="email",
        uploaded_by="email_fetcher",
        email_from=from_addr,
        email_to=to_addr,
        email_date=date_str,
        email_message_id=message_id,
        owner=owner,
    )


# ── 엔드포인트 ─────────────────────────────────────────────────

@router.post("/email/fetch", response_model=FetchResponse)
async def fetch_emails(
    background_tasks: BackgroundTasks,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """사용자 메일 계정 설정으로 POP3에서 이메일을 가져와 백그라운드에서 처리합니다."""
    cfg = db.query(UserMailConfig).filter(UserMailConfig.user_email == current_user.email).first()
    if not cfg:
        raise HTTPException(
            status_code=400,
            detail="메일 계정이 설정되지 않았습니다. 우측 상단 사용자 메뉴에서 '메일 계정 설정'을 먼저 완료하세요."
        )

    password = decrypt_password(cfg.encrypted_password)
    emails = fetch_recent_emails(
        limit=limit,
        host=cfg.host,
        port=cfg.port,
        username=cfg.username,
        password=password,
        use_ssl=cfg.use_ssl,
    )
    fetched = len(emails)
    queued = 0
    for email_data in emails:
        background_tasks.add_task(_process_email_item, email_data)
        queued += 1
    return FetchResponse(fetched=fetched, queued=queued)


@router.get("/email/customers", response_model=list[str])
def list_email_customers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이메일이 있는 고객사 목록을 반환합니다."""
    q = db.query(Document.customer_id).filter(Document.doc_type == "email").filter(Document.customer_id.isnot(None))
    if current_user.role != "admin":
        q = q.filter(Document.owner == current_user.email)
    rows = q.distinct().all()
    return sorted(row[0] for row in rows if row[0])


@router.get("/email/domain-map")
def get_domain_map(current_user: User = Depends(get_current_user)):
    """도메인-고객사 매핑 파일 내용을 반환합니다."""
    return _load_domain_map()


@router.get("/email/list", response_model=list[EmailListItem])
def list_emails(
    customer_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """doc_type='email'인 Document 목록을 반환합니다."""
    q = db.query(Document).filter(Document.doc_type == "email")
    if current_user.role != "admin":
        q = q.filter(Document.owner == current_user.email)
    if customer_id:
        q = q.filter(Document.customer_id == customer_id)
    docs = q.order_by(Document.created_at.desc()).all()

    return [
        EmailListItem(
            id=str(doc.id),
            title=doc.title,
            customer_id=doc.customer_id,
            processing_status=doc.processing_status,
            created_at=doc.created_at.isoformat(),
            tags=_tags_from_doc(doc),
        )
        for doc in docs
    ]


@router.get("/email/{document_id}", response_model=EmailDetailItem)
def get_email_detail(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이메일 Document의 상세 정보와 본문(청크 재조합)을 반환합니다."""
    q = db.query(Document).filter(Document.id == document_id, Document.doc_type == "email")
    if current_user.role != "admin":
        q = q.filter(Document.owner == current_user.email)
    doc = q.first()
    if not doc:
        raise HTTPException(status_code=404, detail="이메일을 찾을 수 없습니다")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )
    content = "\n".join(c.content for c in chunks) if chunks else None

    return EmailDetailItem(
        id=str(doc.id),
        title=doc.title,
        customer_id=doc.customer_id,
        processing_status=doc.processing_status,
        created_at=doc.created_at.isoformat(),
        tags=_tags_from_doc(doc),
        content=content,
    )
