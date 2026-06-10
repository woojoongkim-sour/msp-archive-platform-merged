import poplib
import email
from email import policy
from email.header import decode_header
from html.parser import HTMLParser
import os
from datetime import datetime


# ── HTML 태그 제거 ─────────────────────────────────────────────

class _TagStripper(HTMLParser):
    """표준 라이브러리 html.parser를 이용해 HTML 태그를 제거합니다."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def _strip_html(html_text: str) -> str:
    stripper = _TagStripper()
    stripper.feed(html_text)
    return stripper.get_text()


# ── 헤더 디코딩 ─────────────────────────────────────────────

def _decode_header_value(raw_value: str | None) -> str:
    """RFC 2047 인코딩된 헤더 값을 UTF-8 문자열로 반환합니다."""
    if raw_value is None:
        return ""
    parts = decode_header(raw_value)
    decoded_parts = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded_parts.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded_parts.append(part)
    return "".join(decoded_parts)


# ── 날짜 파싱 ─────────────────────────────────────────────

def _parse_date(date_str: str | None) -> str | None:
    """이메일 Date 헤더를 ISO 8601 문자열로 변환합니다."""
    if not date_str:
        return None
    from email.utils import parsedate_to_datetime
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.isoformat()
    except Exception:
        return date_str


# ── 본문 추출 ─────────────────────────────────────────────

def _extract_body(msg: email.message.Message) -> str:
    """plain text 우선, 없으면 HTML에서 태그를 제거하여 반환합니다."""
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

    return plain_body or html_body or ""


# ── 메인 함수 ─────────────────────────────────────────────

def fetch_recent_emails(
    limit: int = 5,
    host: str | None = None,
    port: int | None = None,
    username: str | None = None,
    password: str | None = None,
    use_ssl: bool = False,
) -> list[dict]:
    """
    POP3 서버에서 최근 이메일을 가져옵니다.

    자격증명을 인자로 받지 않으면 환경변수 기본값을 사용합니다.
    """
    host     = host     or os.getenv("POP3_SERVER", "webmail.cengroup.co.kr")
    port     = port     or int(os.getenv("POP3_PORT", "110"))
    username = username or os.getenv("EMAIL_USER",  "alshd39@itcen.com")
    password = password or os.getenv("EMAIL_PASS",  "Yijemisa00!")

    results: list[dict] = []
    try:
        if use_ssl:
            server = poplib.POP3_SSL(host, port)
        else:
            server = poplib.POP3(host, port)
        server.user(username)
        server.pass_(password)

        num_messages = len(server.list()[1])
        start_index = max(1, num_messages - limit + 1)

        for i in range(start_index, num_messages + 1):
            lines = server.retr(i)[1]
            raw_bytes = b"\n".join(lines)

            msg = email.message_from_bytes(raw_bytes, policy=policy.compat32)

            subject    = _decode_header_value(msg.get("Subject", "No Subject"))
            from_addr  = _decode_header_value(msg.get("From", ""))
            to_addr    = _decode_header_value(msg.get("To", ""))
            date_str   = _parse_date(msg.get("Date"))
            message_id = msg.get("Message-ID", f"<unknown_{i}>")
            body       = _extract_body(msg)

            results.append({
                "subject":    subject,
                "from_addr":  from_addr,
                "to_addr":    to_addr,
                "date":       date_str,
                "message_id": message_id,
                "body":       body,
                "raw_bytes":  raw_bytes,
            })

        server.quit()
    except Exception as e:
        print(f"Error fetching emails: {e}")

    return results
