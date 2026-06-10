"""한글(HWP 5.0) 파서 — pyhwp의 hwp5txt CLI로 텍스트 추출."""
import subprocess
from .base import ParseResult, ParsedSection


def parse_hwp(file_path: str) -> ParseResult:
    try:
        result = subprocess.run(
            ["hwp5txt", file_path],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return ParseResult(meta_only=True, metadata={"error": "hwp5txt(pyhwp) 미설치"})
    except subprocess.TimeoutExpired:
        return ParseResult(meta_only=True, metadata={"error": "HWP 변환 시간 초과"})
    except Exception as e:
        return ParseResult(meta_only=True, metadata={"error": str(e)[:200]})

    if result.returncode != 0:
        err = (result.stderr or "").lower()
        if "password" in err or "encrypt" in err:
            return ParseResult(meta_only=True, metadata={"encrypted": True})
        return ParseResult(meta_only=True, metadata={"error": (result.stderr or "변환 실패")[:200]})

    text = (result.stdout or "").strip()
    if not text:
        return ParseResult(meta_only=True, metadata={"empty": True})

    return ParseResult(
        sections=[ParsedSection(title=None, content=text)],
        full_text=text,
        metadata={"format": "hwp"},
    )
