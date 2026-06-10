from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional
import re

from app.services.document_parser import ParsedSection


@dataclass
class ChunkResult:
    content: str
    section_title: Optional[str]
    chunk_index: int
    token_count: int


def _split_paragraphs(text: str) -> List[str]:
    return [p.strip() for p in text.split("\n\n") if p.strip()]


def _split_into_sentences(paragraph: str) -> List[str]:
    pattern = r"(?<=[.!?])\s+(?=[A-Z가-힣])"
    parts = re.split(pattern, paragraph)
    if len(parts) <= 1:
        return re.split(r"(?<=[.!?])\s+", paragraph)
    return parts


def chunk_sections(sections: List[ParsedSection], max_chunk_size: int = 1000, overlap: int = 200) -> List[ChunkResult]:
    chunks: List[ChunkResult] = []
    chunk_idx = 0
    for sec in sections:
        if not sec.content:
            continue
        paras = _split_paragraphs(sec.content)
        for para in paras:
            if len(para) <= max_chunk_size:
                token_count = max(1, len(para) // 3)
                chunk_text = para
                if chunks:
                    # apply overlap with previous chunk text
                    prev = chunks[-1].content
                    if overlap > 0 and len(prev) >= overlap:
                        chunk_text = prev[-overlap:] + chunk_text
                        token_count = max(1, len(chunk_text) // 3)
                chunks.append(ChunkResult(content=chunk_text, section_title=sec.title, chunk_index=chunk_idx, token_count=token_count))
                chunk_idx += 1
            else:
                # Break long paragraph into sentences
                sentences = _split_into_sentences(para)
                buffer = ""
                for s in sentences:
                    s = s.strip()
                    if not s:
                        continue
                    if len(buffer) + len(s) + 1 <= max_chunk_size:
                        buffer = (buffer + " " + s).strip()
                    else:
                        if buffer:
                            token_count = max(1, len(buffer) // 3)
                            if chunks:
                                prev = chunks[-1].content
                                if overlap > 0 and len(prev) >= overlap:
                                    buffer = prev[-overlap:] + buffer
                                    token_count = max(1, len(buffer) // 3)
                            chunks.append(ChunkResult(content=buffer, section_title=sec.title, chunk_index=chunk_idx, token_count=token_count))
                            chunk_idx += 1
                            buffer = s
                if buffer:
                    token_count = max(1, len(buffer) // 3)
                    if chunks:
                        prev = chunks[-1].content
                        if overlap > 0 and len(prev) >= overlap:
                            buffer = prev[-overlap:] + buffer
                            token_count = max(1, len(buffer) // 3)
                    chunks.append(ChunkResult(content=buffer, section_title=sec.title, chunk_index=chunk_idx, token_count=token_count))
                    chunk_idx += 1
    return chunks
