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

logger = logging.getLogger(__name__)

app = FastAPI(title="MSP Archive Platform API", version="0.1.0")

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

    # owner 컬럼 추가 (없는 경우)
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner VARCHAR(320);"))
        conn.commit()

    # 기존 이메일 문서 owner 마이그레이션: email_to → owner (이메일 주소만 추출)
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

    # owner 인덱스 생성 (마이그레이션 후)
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_documents_owner ON documents (owner);"))
            conn.commit()
        except Exception as e:
            logger.warning("owner 인덱스 생성 실패 (무시): %s", e)
            conn.rollback()

    # 초기 admin 계정 자동 생성
    _ensure_admin_user()


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


app.include_router(auth_router.router, prefix="/api/v1", tags=["auth"])
app.include_router(data_router.router, prefix="/api/v1", tags=["data"])
app.include_router(chat_router.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(search_router.router, prefix="/api/v1", tags=["search"])
app.include_router(events_router.router, prefix="/api/v1", tags=["events"])
app.include_router(email_router.router, prefix="/api/v1", tags=["email"])
app.include_router(graph_router.router, prefix="/api/v1", tags=["graph"])


@app.get("/")
def root():
    return {"message": "MSP Archive Platform API"}


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}
