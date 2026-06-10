from dataclasses import dataclass, field


@dataclass
class ParsedSection:
    title: str | None
    content: str


@dataclass
class ParseResult:
    sections: list[ParsedSection] = field(default_factory=list)
    full_text: str = ""
    meta_only: bool = False
    metadata: dict = field(default_factory=dict)
