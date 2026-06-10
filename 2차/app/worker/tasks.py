"""
ARQ 비동기 작업: process_document
parse → chunk → embed → finalize (Redis pub/sub로 진행 상황 발행)
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def process_document(ctx: dict, document_id: str):
    """
    문서 처리 파이프라인 (ARQ 비동기 태스크).
    Redis pub/sub channel: doc_progress:{document_id}
    """
    redis = ctx.get("redis")

    async def publish(step: str, status: str, message: str = ""):
        if redis:
            try:
                await redis.publish(
                    f"doc_progress:{document_id}",
                    json.dumps({"step": step, "status": status, "message": message}),
                )
            except Exception:
                pass

    loop = asyncio.get_event_loop()

    # ── 헬퍼: 동기 DB 작업을 executor로 실행 ─────────────────────
    def _get_document():
        from app.db.session import SessionLocal
        from app.models.document import Document
        db = SessionLocal()
        try:
            return db.query(Document).filter(Document.id == document_id).first()
        finally:
            db.close()

    def _update_status(status: str, indexing_status: str | None = None):
        from app.db.session import SessionLocal
        from app.models.document import Document
        db = SessionLocal()
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.processing_status = status
                if indexing_status:
                    doc.indexing_status = indexing_status
                db.commit()
        finally:
            db.close()

    def _save_chunks(doc_obj, chunks_data: list):
        from app.db.session import SessionLocal
        from app.models.document_chunk import DocumentChunk
        db = SessionLocal()
        try:
            existing = db.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            ).count()
            if existing > 0:
                return  # 이미 처리됨

            for c in chunks_data:
                chunk = DocumentChunk(
                    document_id=document_id,
                    content=c["content"],
                    chunk_index=c["chunk_index"],
                    section_title=c.get("section_title"),
                    embedding_source="original",
                    dense_vector=c["dense_vector"],
                )
                db.add(chunk)
            db.commit()
        finally:
            db.close()

    def _log_job(status: str, error: str | None = None):
        from app.db.session import SessionLocal
        from app.models.job_log import JobLog
        db = SessionLocal()
        try:
            db.add(JobLog(
                job_type="process_document",
                target_id=document_id,
                target_type="document",
                status=status,
                error_message=error,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc) if status in ("completed", "failed") else None,
            ))
            db.commit()
        finally:
            db.close()

    # ── 1. 문서 조회 ───────────────────────────────────────────────
    doc = await loop.run_in_executor(None, _get_document)
    if not doc:
        logger.error("Document %s not found", document_id)
        return

    # ── 2. 파싱 ────────────────────────────────────────────────────
    await _update_status("processing")
    await publish("parsing", "in_progress", "문서 파싱 중...")

    try:
        from app.services.document_parser import parse_document
        sections, meta_only = await loop.run_in_executor(
            None, parse_document, doc.file_path
        )

        if meta_only or not sections:
            await loop.run_in_executor(None, _update_status, "blocked", "not_indexed")
            await publish("parsing", "completed", "메타정보만 저장 (보호/미지원 파일)")
            await publish("complete", "completed", "처리 완료 (meta_only)")
            return

        await publish("parsing", "completed", f"파싱 완료 ({len(sections)}섹션)")

    except Exception as e:
        await loop.run_in_executor(None, _update_status, "failed")
        await publish("parsing", "failed", str(e))
        await loop.run_in_executor(None, _log_job, "failed", str(e))
        return

    # ── 3. 청킹 ────────────────────────────────────────────────────
    await publish("chunking", "in_progress", "청킹 중...")
    try:
        from app.services.chunking import chunk_sections
        chunk_results = await loop.run_in_executor(None, chunk_sections, sections)
        await publish("chunking", "completed", f"청킹 완료 ({len(chunk_results)}개 청크)")
    except Exception as e:
        await loop.run_in_executor(None, _update_status, "failed")
        await publish("chunking", "failed", str(e))
        await loop.run_in_executor(None, _log_job, "failed", str(e))
        return

    # ── 4. 임베딩 ──────────────────────────────────────────────────
    await publish("embedding", "in_progress", f"임베딩 생성 중... (0/{len(chunk_results)})")
    try:
        from app.core.embedding import embed_texts
        chunk_texts = [c.content for c in chunk_results]
        vectors = await loop.run_in_executor(None, embed_texts, chunk_texts)

        chunks_data = [
            {
                "content": c.content,
                "chunk_index": c.chunk_index,
                "section_title": c.section_title,
                "dense_vector": vectors[i],
            }
            for i, c in enumerate(chunk_results)
        ]
        await publish("embedding", "completed", "임베딩 완료")
    except Exception as e:
        await loop.run_in_executor(None, _update_status, "failed")
        await publish("embedding", "failed", str(e))
        await loop.run_in_executor(None, _log_job, "failed", str(e))
        return

    # ── 5. 저장 ────────────────────────────────────────────────────
    await publish("finalizing", "in_progress", "저장 중...")
    try:
        await loop.run_in_executor(None, _save_chunks, doc, chunks_data)
        await loop.run_in_executor(None, _update_status, "completed", "indexed")
        await publish("finalizing", "completed", "저장 완료")
        await publish("complete", "completed", f"처리 완료 (청크 {len(chunks_data)}개)")
        await loop.run_in_executor(None, _log_job, "completed")
    except Exception as e:
        await loop.run_in_executor(None, _update_status, "failed")
        await publish("finalizing", "failed", str(e))
        await loop.run_in_executor(None, _log_job, "failed", str(e))
