from .base import ParseResult, ParsedSection
from .hwp_parser import parse_hwp

PARSER_MAP: dict = {
    "hwp": parse_hwp,
}

__all__ = ["ParseResult", "ParsedSection", "parse_hwp", "PARSER_MAP"]
