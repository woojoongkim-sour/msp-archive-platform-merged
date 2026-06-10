import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db.base import Base  # 전체 모델 등록
from app.db.session import engine, SessionLocal
from app.api.v1 import data as data_router
from app.api.v1 import chat as chat_router
from app.api.v1 import search as search_router
from app.api.v1 import events as events_router
from app.api.v1 import email as email_router
from app.api.v1 import graph as graph_router
from app.api.v1 import auth as auth_router
from app.api.v1 import customers as customers_router
from app.api.v1 import alerts as alerts_router
from app.api.v1 import system as system_router

logger = logging.getLogger(__name__)

app = FastAPI(title="MSP Archive Platform API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgroonga;"))
        conn.commit()
    Base.metadata.create_all(bind=engine)

    # 컬럼 마이그레이션 (없는 경우 추가)
    _run_column_migrations()

    # 초기 admin 계정 자동 생성
    _ensure_admin_user()


def _run_column_migrations():
    """신규 컬럼 추가 (ALTER TABLE IF NOT EXISTS — 안전하게 반복 실행 가능)."""
    migrations = [
        # documents 테이블
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner VARCHAR(320);",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_group_id UUID;",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);",
        # document_chunks 테이블
        "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(500);",
        # messages 테이블
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources JSONB;",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS route_type VARCHAR(20);",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback VARCHAR(10);",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls INTEGER DEFAULT 0;",
        # conversations 테이블
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS search_mode VARCHAR(20) DEFAULT 'single';",
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();",
        # 인덱스
        "CREATE INDEX IF NOT EXISTS ix_documents_owner ON documents (owner);",
        "CREATE INDEX IF NOT EXISTS ix_documents_version_group ON documents (version_group_id);",
        "CREATE INDEX IF NOT EXISTS ix_documents_source_type ON documents (source_type);",
    ]

    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                logger.warning("마이그레이션 스킵 (무시): %s — %s", sql[:60], e)
                conn.rollback()

    # owner 컬럼 이메일 마이그레이션 (최초 1회)
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                UPDATE documents
                SET owner = LEFT(
                    (REGEXP_MATCH(tags->>'email_to', '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}'))[1],
                    320
                )
                WHERE doc_type = 'email'
                  AND owner IS NULL
                  AND tags->>'email_to' IS NOT NULL
                  AND tags->>'email_to' != '';
            """))
            conn.commit()
        except Exception as e:
            logger.warning("owner 마이그레이션 실패 (무시): %s", e)
            conn.rollback()


def _ensure_admin_user():
    from app.models.user import User
    from app.core.security import hash_password

    admin_email = os.getenv("FIRST_ADMIN_EMAIL", "admin@itcen.com")
    admin_password = os.getenv("FIRST_ADMIN_PASSWORD", "admin1234!")

    db = SessionLocal()
    try:
        if not db.query(User).first():
            admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info("초기 admin 계정 생성: %s", admin_email)
    finally:
        db.close()


# ── 라우터 등록 ──────────────────────────────────────────────────────
app.include_router(auth_router.router, prefix="/api/v1", tags=["auth"])
app.include_router(data_router.router, prefix="/api/v1", tags=["data"])
app.include_router(chat_router.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(search_router.router, prefix="/api/v1", tags=["search"])
app.include_router(events_router.router, prefix="/api/v1", tags=["events"])
app.include_router(email_router.router, prefix="/api/v1", tags=["email"])
app.include_router(graph_router.router, prefix="/api/v1", tags=["graph"])
app.include_router(customers_router.router, prefix="/api/v1", tags=["customers"])
app.include_router(alerts_router.router, prefix="/api/v1", tags=["alerts"])
app.include_router(system_router.router, prefix="/api/v1", tags=["system"])


@app.get("/")
def root():
    return {"message": "MSP Archive Platform API v2"}


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}
