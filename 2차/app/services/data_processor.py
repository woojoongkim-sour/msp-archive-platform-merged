"""
data_processor.py
팀원 코드 베이스 + wjkim 개선 파싱/청킹 통합본

변경 내역:
- 텍스트 추출: _extract_pdf/docx/xlsx 단순 추출 → document_parser.py 구조적 파싱으로 교체
  (PDF 섹션/테이블, DOCX 헤딩, PPTX 슬라이드, XLSX 시트별 파싱)
- 청킹: LangChain RecursiveCharacterTextSplitter → chunking.py 섹션 기반 가변 청킹으로 교체
- 이메일 파싱(_extract_eml), 도메인 매핑, 감사 로그, 중복 체크 등 팀원 로직 전부 유지
- Gotenberg 레거시 변환(.doc/.ppt) 지원 추가
"""

import json
import os
import hashlib
import logging
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_processing_attempt import DocumentProcessingAttempt
from app.models.audit_log import AuditLog
from app.core.embedding import embed_texts

# 내 개선 파싱/청킹 모듈
from app.services.document_parser import parse_document
from app.services.chunking import chunk_sections
from app.services.gotenberg_client import GotenbergClient

logger = logging.getLogger(__name__)

# ── 이메일 파싱 (팀원 코드 유지) ───────────────────────────────
import email as _email_lib
from html.parser import HTMLParser


class _TagStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def _strip_html(html_text: str) -> str:
    s = _TagStripper()
    s.feed(html_text)
    return s.get_text()


def _extract_eml(file_path: str) -> tuple[str | None, str]:
    """EML 파일에서 body 텍스트 추출. (팀원 코드 유지)"""
    try:
        with open(file_path, "rb") as f:
            raw = f.read()
        msg = _email_lib.message_from_bytes(raw)

        plain_body = None
        html_body = None

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if part.get_content_disposition() == "attachment":
                    continue
                if content_type == "text/plain" and plain_body is None:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    if payload:
                        plain_body = payload.decode(charset, errors="replace")
                elif content_type == "text/html" and html_body is None:
                    charset = part.get_content_charset() or "utf-8"
                    payload = part.get_payload(decode=True)
                    if payload:
                        html_body = _strip_html(payload.decode(charset, errors="replace"))
        else:
            content_type = msg.get_content_type()
            charset = msg.get_content_charset() or "utf-8"
            payload = msg.get_payload(decode=True)
            if payload:
                text = payload.decode(charset, errors="replace")
                if content_type == "text/html":
                    html_body = _strip_html(text)
                else:
                    plain_body = text

        body = plain_body or html_body or ""
        return body or None, "none"
    except Exception as e:
        logger.warning("EML 추출 실패: %s — %s", file_path, e)
        return None, "unknown"


# ── 도메인 → customer_id 매핑 (팀원 코드 유지) ─────────────────

CUSTOMER_DOMAIN_MAP_PATH = os.getenv("CUSTOMER_DOMAIN_MAP_PATH", "/app/customer_domain_map.json")


def _load_domain_map() -> dict:
    try:
        with open(CUSTOMER_DOMAIN_MAP_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("customer_domain_map.json 로드 실패: %s", e)
        return {}


def _domain_from_addr(addr: str) -> str | None:
    try:
        at_part = addr.split("@", 1)[1]
        domain = at_part.split(">")[0].strip().lower()
        return domain
    except Exception:
        return None


def resolve_customer_id(email_from: str, subject: str | None = None) -> str:
    domain_map = _load_domain_map()
    domain = _domain_from_addr(email_from)
    if domain and domain in domain_map:
        return domain_map[domain]
    if subject:
        for keyword, customer_id in domain_map.get("_keywords", {}).items():
            if keyword in subject:
                return customer_id
    return domain_map.get("_default", "미분류")


# ── DB 세션 (팀원 코드 유지) ───────────────────────────────────

@contextmanager
def get_db_session():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── 감사 로그 헬퍼 (팀원 코드 유지) ───────────────────────────

def _add_audit(db: Session, action_type: str, actor: str | None, entity_id, details: dict | None = None):
    db.add(AuditLog(
        action_type=action_type,
        actor=actor,
        target_entity_type="document",
        target_entity_id=entity_id,
        details=details,
    ))


# ── 핵심 파이프라인 ────────────────────────────────────────────

async def process_file(
    file_path: str,
    original_filename: str,
    customer_id: str | None = None,
    doc_type: str | None = None,
    uploaded_by: str | None = None,
    email_from: str | None = None,
    email_to: str | None = None,
    email_date: str | None = None,
    email_message_id: str | None = None,
    owner: str | None = None,
) -> dict:
    """
    파일 업로드 후 백그라운드에서 실행되는 처리 파이프라인.

    이메일(.eml)은 기존 팀원 로직으로 처리.
    그 외 문서(PDF/DOCX/PPTX/XLSX 등)는 wjkim 구조적 파싱 + 섹션 기반 청킹으로 처리.
    레거시 포맷(.doc/.ppt)은 Gotenberg로 변환 후 파싱.
    """
    logger.info("Processing started: %s", original_filename)

    _, dot_ext = os.path.splitext(original_filename)
    ext = dot_ext.lower()

    # 이메일 doc_type이고 customer_id 미설정 → 도메인 자동 매핑
    if doc_type == "email" and customer_id is None and email_from:
        customer_id = resolve_customer_id(email_from)
        logger.info("Auto-mapped customer_id=%s from %s", customer_id, email_from)

    with get_db_session() as db:
        # 1. 파일 해시 계산 및 중복 체크
        with open(file_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        file_size = os.path.getsize(file_path)

        dup_q = db.query(Document).filter(Document.file_hash == file_hash)
        if doc_type == "email" and owner:
            dup_q = dup_q.filter(Document.owner == owner)
        existing = dup_q.first()
        if existing:
            logger.warning("Duplicate skipped: %s (hash=%s)", original_filename, file_hash)
            return {"status": "duplicate_skipped", "document_id": str(existing.id)}

        # 이메일 메타데이터 tags 구성
        extra_tags: dict = {}
        if doc_type == "email":
            if email_from:
                extra_tags["email_from"] = email_from
            if email_to:
                extra_tags["email_to"] = email_to
            if email_date:
                extra_tags["email_date"] = email_date
            if email_message_id:
                extra_tags["email_message_id"] = email_message_id

        # 2. Document 레코드 생성
        doc = Document(
            customer_id=customer_id,
            owner=owner,
            title=original_filename,
            doc_type=doc_type,
            file_format=ext.lstrip("."),
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            protection_type="unknown",
            processing_status="processing",
            processing_capability="metadata_only",
            indexing_status="not_indexed",
            searchable_scope="metadata_only",
            tags=extra_tags,
        )
        db.add(doc)
        db.flush()

        _add_audit(db, "document_upload", uploaded_by, doc.id,
                   {"filename": original_filename, "file_size": file_size})

        doc.last_processing_attempt_at = datetime.now(timezone.utc)

        # 3. 파싱 분기
        #    이메일(.eml) → 팀원 EML 파서 (평문 텍스트 추출)
        #    그 외 → wjkim 구조적 파서 (섹션/테이블/슬라이드 단위 파싱)

        if ext == ".eml":
            # ── 이메일 경로 (팀원 로직 유지) ──────────────────
            text, protection_type = _extract_eml(file_path)
            doc.protection_type = protection_type

            if text is None:
                doc.processing_status = "failed"
                doc.processing_error_reason = "EML 텍스트 추출 실패"
                doc.manual_refined_required = True
                db.add(DocumentProcessingAttempt(
                    document_id=doc.id, result="failed",
                    error_reason=doc.processing_error_reason,
                ))
                _add_audit(db, "processing_failed", None, doc.id,
                           {"protection_type": protection_type})
                return {"status": "failed", "document_id": str(doc.id)}

            chunk_texts = _split_plain_text(text)
            if not chunk_texts:
                doc.processing_status = "failed"
                doc.processing_error_reason = "청킹 결과가 비어있습니다"
                db.add(DocumentProcessingAttempt(
                    document_id=doc.id, result="failed",
                    error_reason=doc.processing_error_reason,
                ))
                return {"status": "failed", "document_id": str(doc.id)}

            vectors = embed_texts(chunk_texts)
            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    content=chunk_text,
                    chunk_index=i,
                    embedding_source="original",
                    dense_vector=vector,
                )
                for i, (chunk_text, vector) in enumerate(zip(chunk_texts, vectors))
            ]

        else:
            # ── 문서 경로 (wjkim 구조적 파싱 + 섹션 청킹) ────
            parse_path = file_path

            # 레거시 포맷(.doc/.ppt) → Gotenberg 변환
            if ext in (".doc", ".ppt"):
                try:
                    gotenberg = GotenbergClient()
                    with open(file_path, "rb") as f:
                        file_bytes = f.read()
                    converted = await gotenberg.convert(file_bytes, original_filename)
                    new_ext = ".docx" if ext == ".doc" else ".pptx"
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=new_ext)
                    tmp.write(converted)
                    tmp.close()
                    parse_path = tmp.name
                    logger.info("Gotenberg 변환 완료: %s → %s", original_filename, new_ext)
                except Exception as e:
                    logger.warning("Gotenberg 변환 실패, 원본으로 진행: %s", e)

            sections, meta_only = parse_document(parse_path)

            # 임시 변환 파일 정리
            if parse_path != file_path:
                try:
                    os.remove(parse_path)
                except Exception:
                    pass

            if meta_only or not sections:
                # 파싱 실패 또는 보호 문서
                doc.protection_type = "unknown" if not meta_only else doc.protection_type
                doc.processing_status = "blocked" if meta_only else "failed"
                doc.processing_error_reason = "문서 보호 또는 파싱 불가"
                doc.manual_refined_required = True
                db.add(DocumentProcessingAttempt(
                    document_id=doc.id, result="failed",
                    error_reason=doc.processing_error_reason,
                ))
                _add_audit(db, "protection_detected" if meta_only else "processing_failed",
                           None, doc.id, {"reason": doc.processing_error_reason})
                logger.warning("Processing blocked/failed: %s", original_filename)
                return {"status": "blocked" if meta_only else "failed",
                        "document_id": str(doc.id)}

            doc.protection_type = "none"

            # 섹션 기반 가변 청킹
            chunk_results = chunk_sections(sections)
            if not chunk_results:
                doc.processing_status = "failed"
                doc.processing_error_reason = "청킹 결과가 비어있습니다"
                db.add(DocumentProcessingAttempt(
                    document_id=doc.id, result="failed",
                    error_reason=doc.processing_error_reason,
                ))
                return {"status": "failed", "document_id": str(doc.id)}

            chunk_texts = [c.content for c in chunk_results]
            vectors = embed_texts(chunk_texts)
            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    content=c.content,
                    chunk_index=c.chunk_index,
                    section_title=c.section_title,
                    embedding_source="original",
                    dense_vector=vector,
                )
                for c, vector in zip(chunk_results, vectors)
            ]

        # 4. 청크 저장
        db.add_all(chunks)

        # 5. Document 상태 업데이트
        doc.processing_capability = "full"
        doc.processing_status = "completed"
        doc.indexing_status = "indexed"
        doc.searchable_scope = "full"

        db.add(DocumentProcessingAttempt(document_id=doc.id, result="success"))
        _add_audit(db, "document_indexed", None, doc.id,
                   {"chunk_count": len(chunks)})

        doc_id = str(doc.id)
        chunk_count = len(chunks)

    logger.info("Processing complete: %s — %d chunks", original_filename, chunk_count)
    return {"status": "completed", "document_id": doc_id, "chunk_count": chunk_count}


# ── 이메일용 평문 청킹 헬퍼 ──────────────────────────────────
# 이메일은 구조적 섹션이 없으므로 단순 분할 유지

def _split_plain_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> list[str]:
    """단순 슬라이딩 윈도우 청킹 (이메일 전용)."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return [c for c in chunks if c.strip()]
