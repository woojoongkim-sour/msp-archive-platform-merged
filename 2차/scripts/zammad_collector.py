"""
Zammad 티켓 수집기 — SR 티켓을 Archive 문서로 변환/저장
사용: python scripts/zammad_collector.py
"""
import hashlib
import os
import sys
from pathlib import Path

import httpx

# 프로젝트 루트를 path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.document import Document

ZAMMAD_URL = os.getenv("ZAMMAD_API_URL", "").rstrip("/")
ZAMMAD_TOKEN = os.getenv("ZAMMAD_API_TOKEN", "")
MAX_TICKETS = int(os.getenv("MAX_TICKETS", "500"))
STORAGE_DIR = os.getenv("FILE_STORAGE_PATH", "/app/uploads/zammad")


def _headers() -> dict:
    return {"Authorization": f"Token token={ZAMMAD_TOKEN}"}


def _html_to_text(html: str) -> str:
    from html.parser import HTMLParser

    class _Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self._parts = []
        def handle_data(self, data):
            self._parts.append(data)
        def get_text(self):
            return " ".join(self._parts).strip()

    s = _Stripper()
    s.feed(html)
    return s.get_text()


def fetch_tickets() -> list:
    tickets = []
    with httpx.Client(timeout=30) as client:
        page = 1
        while len(tickets) < MAX_TICKETS:
            r = client.get(
                f"{ZAMMAD_URL}/api/v1/tickets",
                params={"per_page": 100, "page": page, "expand": "true"},
                headers=_headers(),
            )
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            tickets.extend(batch)
            if len(batch) < 100:
                break
            page += 1

        tickets = tickets[:MAX_TICKETS]
        print(f"[Zammad] 티켓 {len(tickets)}건 조회, 아티클 수집 중...")

        items = []
        for t in tickets:
            tid = t["id"]
            try:
                ra = client.get(
                    f"{ZAMMAD_URL}/api/v1/ticket_articles/by_ticket/{tid}",
                    headers=_headers(),
                )
                articles = ra.json() if ra.status_code == 200 else []
            except Exception as e:
                print(f"  [티켓 {tid}] 아티클 조회 오류: {e}")
                articles = []
            items.append({"ticket": t, "articles": articles})
    return items


def build_full_text(t: dict, articles: list) -> str:
    lines = [
        f"제목: {t.get('title')}",
        f"티켓번호: {t.get('number')}",
        f"상태: {t.get('state')}",
        f"우선순위: {t.get('priority')}",
        f"담당그룹: {t.get('group')}",
        f"고객: {t.get('customer')}",
        f"생성일: {t.get('created_at')}",
        "",
        "--- 대화 내역 ---",
    ]
    for a in articles:
        body = a.get("body") or ""
        if (a.get("content_type") or "").startswith("text/html"):
            body = _html_to_text(body)
        sender = a.get("sender") or ""
        frm = a.get("from") or ""
        created = a.get("created_at") or ""
        internal = " (내부메모)" if a.get("internal") else ""
        header = f"[{created} | {sender}{internal}]"
        if frm:
            header += f" {frm}"
        lines.append(header)
        if body.strip():
            lines.append(body.strip())
        lines.append("")
    return "\n".join(lines).strip()


def auto_classify_customer(db: Session, customer_name: str) -> str | None:
    """티켓 고객명으로 customer_id (code) 자동 분류."""
    if not customer_name:
        return None
    try:
        from app.models.customer import Customer, CustomerAlias
        customers = db.query(Customer).filter_by(is_active=True).all()
        for c in customers:
            if c.name in customer_name or customer_name in c.name:
                return c.code
            for a in (c.aliases or []):
                if a.alias in customer_name or customer_name in a.alias:
                    return c.code
    except Exception:
        pass
    return None


def save_ticket_as_document(db: Session, item: dict, customer_id: str | None) -> int | None:
    t = item["ticket"]
    articles = item["articles"]
    full_text = build_full_text(t, articles)
    content_hash = hashlib.sha256(full_text.encode()).hexdigest()

    # 중복 체크 (file_hash 사용)
    existing = db.query(Document).filter_by(file_hash=content_hash).first()
    if existing:
        return None

    storage_dir = Path(STORAGE_DIR) / str(customer_id or "unclassified")
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"{content_hash[:16]}.txt"
    file_path.write_text(full_text, encoding="utf-8")

    title = f"[티켓#{t.get('number')}] {t.get('title')}"
    doc = Document(
        customer_id=customer_id,
        title=title[:500],
        file_path=str(file_path),
        file_size=len(full_text.encode()),
        file_hash=content_hash,
        doc_type="zammad",
        source_type="zammad",
        file_format="txt",
        protection_type="none",
        processing_status="pending",
        processing_capability="metadata_only",
        indexing_status="not_indexed",
        searchable_scope="metadata_only",
        tags={
            "ticket_id": t.get("id"),
            "ticket_number": t.get("number"),
            "state": t.get("state"),
            "priority": t.get("priority"),
        },
    )
    db.add(doc)
    db.flush()
    return doc.id


def main():
    if not ZAMMAD_URL or not ZAMMAD_TOKEN:
        print("ZAMMAD_API_URL / ZAMMAD_API_TOKEN 환경변수가 필요합니다.")
        return

    print("=" * 60)
    print(f"Zammad 티켓 수집 시작 — {ZAMMAD_URL}")
    print("=" * 60)

    items = fetch_tickets()
    print(f"\n총 {len(items)}개 티켓 처리 시작...\n")

    db = SessionLocal()
    saved = 0
    skipped = 0
    try:
        for item in items:
            t = item["ticket"]
            customer_id = auto_classify_customer(db, t.get("customer", "") or "")
            doc_id = save_ticket_as_document(db, item, customer_id)
            if doc_id:
                saved += 1
                print(f"  ✓ [{customer_id or '미분류'}] [티켓#{t.get('number')}] {str(t.get('title'))[:40]} → doc_id={doc_id}")
            else:
                skipped += 1
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"오류 발생: {e}")
    finally:
        db.close()

    print(f"\n{'='*60}")
    print(f"완료: {saved}개 저장, {skipped}개 스킵(중복)")
    print(f"{'='*60}")
    print("\n문서 처리 상태는 http://localhost:3000/documents 에서 확인하세요.")
    print("처리되지 않은 문서는 ARQ 워커가 자동으로 임베딩합니다.")


if __name__ == "__main__":
    main()
