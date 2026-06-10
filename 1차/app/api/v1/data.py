import logging
import os
import shutil
from typing import List
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.db.session import get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.source import DocumentResponse
from app.services.data_processor import process_file
from app.core.embedding import embed_texts
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)


# ── 정제본 인덱싱 헬퍼 ────────────────────────────────────────

def _index_refined_document(refined_id: str, text: str, document_id: str) -> None:
    import uuid as _uuid
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        refined_uuid = _uuid.UUID(refined_id)
        doc_uuid = _uuid.UUID(document_id)

        doc = db.query(Document).filter(Document.id == doc_uuid).first()
        if not doc:
            logger.error("_index_refined_document: Document not found: %s", document_id)
            return

        chunk_texts = _splitter.split_text(text)
        if not chunk_texts:
            return

        vectors = embed_texts(chunk_texts)

        chunks = [
            DocumentChunk(
                document_id=doc_uuid,
                refined_document_id=refined_uuid,
                content=chunk_text,
                chunk_index=i,
                embedding_source="refined",
                dense_vector=vector,
            )
            for i, (chunk_text, vector) in enumerate(zip(chunk_texts, vectors))
        ]
        db.add_all(chunks)

        doc.processing_capability = "refinement_only"
        doc.indexing_status = "indexed"
        doc.searchable_scope = "full"

        db.add(AuditLog(
            action_type="refinement_upload",
            actor=None,
            target_entity_type="document",
            target_entity_id=doc_uuid,
            details={"refined_id": refined_id, "chunk_count": len(chunks)},
        ))

        db.commit()
        logger.info("_index_refined_document: %d chunks indexed for doc %s", len(chunks), document_id)
    except Exception as e:
        db.rollback()
        logger.error("_index_refined_document failed: %s", e)
    finally:
        db.close()


# ── 엔드포인트 ────────────────────────────────────────────────

@router.post("/upload", status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    customer_id: str = Form(None),
    doc_type: str = Form(None),
    uploaded_by: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일명이 없습니다")

    safe_name = os.path.basename(file.filename)
    dest_path = os.path.join(UPLOAD_DIR, safe_name)

    try:
        with open(dest_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {e}")
    finally:
        file.file.close()

    background_tasks.add_task(
        process_file,
        file_path=dest_path,
        original_filename=safe_name,
        customer_id=customer_id,
        doc_type=doc_type,
        uploaded_by=uploaded_by or current_user.email,
        owner=current_user.email,
    )

    return {"message": "업로드 완료. 백그라운드에서 처리 중입니다.", "filename": safe_name}


@router.get("/documents", response_model=List[DocumentResponse])
def list_documents(
    customer_id: str | None = None,
    processing_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Document).filter(or_(Document.doc_type != "email", Document.doc_type.is_(None)))
    if customer_id:
        q = q.filter(Document.customer_id == customer_id)
    if processing_status:
        q = q.filter(Document.processing_status == processing_status)
    return q.order_by(Document.created_at.desc()).all()


# /documents/customers는 /documents/{document_id} 보다 먼저 등록해야 함
@router.get("/documents/customers", response_model=List[str])
def list_customers(db: Session = Depends(get_db)):
    """전체 고객사 목록(중복 제거)을 반환합니다."""
    rows = (
        db.query(Document.customer_id)
        .filter(Document.customer_id.isnot(None))
        .distinct()
        .all()
    )
    return sorted(row[0] for row in rows if row[0])


# ── 폴더 관리 스키마 ───────────────────────────────────────────

class MoveDocBody(BaseModel):
    customer_id: str | None  # None → 미분류


class FolderRenameBody(BaseModel):
    old_name: str
    new_name: str


class DoctypeRenameBody(BaseModel):
    customer_id: str
    old_doc_type: str
    new_doc_type: str


class FolderDeleteBody(BaseModel):
    customer_id: str


# ── 폴더 관리 엔드포인트 (반드시 /{document_id} 보다 먼저 등록) ──

@router.post("/documents/folders/rename-customer")
def rename_customer_folder(
    body: FolderRenameBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not body.new_name.strip():
        raise HTTPException(status_code=400, detail="폴더 이름을 입력하세요")
    db.query(Document).filter(Document.customer_id == body.old_name).update(
        {"customer_id": body.new_name.strip()}
    )
    db.commit()
    return {"ok": True}


@router.post("/documents/folders/rename-doctype")
def rename_doctype_folder(
    body: DoctypeRenameBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not body.new_doc_type.strip():
        raise HTTPException(status_code=400, detail="폴더 이름을 입력하세요")
    db.query(Document).filter(
        Document.customer_id == body.customer_id,
        Document.doc_type == body.old_doc_type,
    ).update({"doc_type": body.new_doc_type.strip()})
    db.commit()
    return {"ok": True}


@router.post("/documents/folders/delete-customer")
def delete_customer_folder(
    body: FolderDeleteBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db.query(Document).filter(Document.customer_id == body.customer_id).update(
        {"customer_id": None}
    )
    db.commit()
    return {"ok": True}


@router.post("/documents/{document_id}/move")
def move_document(
    document_id: UUID,
    body: MoveDocBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")
    doc.customer_id = body.customer_id
    db.commit()
    return {"ok": True}


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")
    return doc


@router.get("/documents/{document_id}/content")
def get_document_content(document_id: UUID, db: Session = Depends(get_db)):
    """문서 청크를 순서대로 합쳐 전체 본문을 반환합니다."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )
    content = "\n".join(c.content for c in chunks) if chunks else None

    return {
        "id": str(doc.id),
        "title": doc.title,
        "protection_type": doc.protection_type,
        "processing_status": doc.processing_status,
        "customer_id": doc.customer_id,
        "content": content,
        "chunk_count": len(chunks),
    }


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")
    db.delete(doc)
    db.commit()


@router.post("/documents/{document_id}/refine", status_code=201)
async def upload_refinement(
    document_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    submitted_by: str = Form("unknown"),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다")

    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    from app.models.manual_refined_document import ManualRefinedDocument
    refined = ManualRefinedDocument(
        document_id=doc.id,
        content=text,
        submitted_by=submitted_by,
        status="pending_approval",
    )
    db.add(refined)
    db.flush()

    background_tasks.add_task(_index_refined_document, str(refined.id), text, str(doc.id))
    db.commit()

    return {"message": "정제본 업로드 완료. 인덱싱 중입니다.", "refined_id": str(refined.id)}
