import os
import logging
from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document import Document
from app.models.customer import Customer
from app.models.job_log import JobLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    checks: dict = {}

    # DB
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Redis
    try:
        import redis as _redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = _redis.from_url(redis_url, socket_connect_timeout=2)
        r.ping()
        r.close()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Embedding (HuggingFace token 설정 여부)
    checks["embedding"] = "configured" if os.getenv("HF_TOKEN") else "not configured (HF_TOKEN 미설정)"

    # OpenAI
    checks["openai"] = "configured" if os.getenv("OPENAI_API_KEY") else "not configured (OPENAI_API_KEY 미설정)"

    all_ok = all("error" not in v for v in checks.values())
    return {
        "success": True,
        "data": {"status": "healthy" if all_ok else "degraded", "checks": checks},
    }


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    doc_count = db.query(func.count(Document.id)).scalar() or 0
    customer_count = db.query(func.count(Customer.id)).scalar() or 0
    completed = (
        db.query(func.count(Document.id))
        .filter(Document.processing_status == "completed")
        .scalar() or 0
    )
    indexed = (
        db.query(func.count(Document.id))
        .filter(Document.indexing_status == "indexed")
        .scalar() or 0
    )
    failed = (
        db.query(func.count(Document.id))
        .filter(Document.processing_status == "failed")
        .scalar() or 0
    )

    return {
        "success": True,
        "data": {
            "documents": {
                "total": doc_count,
                "completed": completed,
                "indexed": indexed,
                "failed": failed,
            },
            "customers": customer_count,
        },
    }


@router.get("/jobs")
def list_jobs(
    status: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(JobLog).order_by(JobLog.created_at.desc()).limit(limit)
    if status:
        q = q.filter(JobLog.status == status)
    jobs = q.all()
    return {
        "success": True,
        "data": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "retry_count": j.retry_count,
                "error_message": j.error_message,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
    }
