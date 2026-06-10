import os
from typing import AsyncIterator
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.models.document_chunk import DocumentChunk

_llm = ChatOpenAI(
    model="gpt-4o-mini",
    streaming=True,
    api_key=os.getenv("OPENAI_API_KEY"),
)


async def get_llm_stream(query: str, chunks: list[DocumentChunk]) -> AsyncIterator[str]:
    if chunks:
        context = "\n\n".join(
            f"[출처: {c.document.title if c.document else '알 수 없음'}]\n{c.content}"
            for c in chunks
        )
        system_prompt = (
            "당신은 MSP 운영 전문가 어시스턴트입니다.\n"
            "아래 컨텍스트를 근거로만 답변하고, 컨텍스트에 없는 내용은 추측하지 마세요.\n"
            "답변 끝에 반드시 [출처: 문서명] 형태로 근거를 명시하세요.\n\n"
            f"컨텍스트:\n{context}"
        )
    else:
        system_prompt = (
            "당신은 MSP 운영 전문가 어시스턴트입니다.\n"
            "관련 문서를 찾지 못했습니다. 일반적인 지식으로 답변하되, "
            "관련 문서가 없음을 사용자에게 안내하세요."
        )

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=query)]
    async for chunk in _llm.astream(messages):
        if chunk.content:
            yield chunk.content
