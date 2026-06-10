import os
import json
import logging
from typing import AsyncIterator

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

_llm = ChatOpenAI(
    model="gpt-4o-mini",
    streaming=True,
    api_key=os.getenv("OPENAI_API_KEY"),
)

SYSTEM_PROMPT = """당신은 MSP(Managed Service Provider) 운영 엔지니어를 지원하는 어시스턴트입니다.
모니터링 알람이나 장애 상황에서 엔지니어가 즉시 조치할 수 있도록, Archive(메일/운영문서) 데이터를 근거로
아래에 정의된 **고정 답변 양식**에 맞춰 정리해 줍니다.

[작성 규칙]
1. 반드시 아래 5개 섹션을 **순서와 제목 그대로** 모두 포함하여 답변합니다.
2. 각 섹션은 **제공된 출처 문서에서 찾은 사실만** 기재합니다. 추측·창작하지 않습니다.
3. 출처에 해당 정보가 없으면 그 섹션에는 반드시 `없음` 한 단어만 적습니다.
4. 정보를 기재할 때는 근거 출처를 함께 표기합니다. 예: `— 출처: "제목" (날짜)`
5. 크로스 검색으로 다른 고객사 문서를 참조한 경우 해당 고객사명을 명시합니다.
6. 모든 답변은 한국어, Markdown 형식으로 작성합니다.

[답변 양식]
## 🚨 비상 연락망
담당자명·역할·연락처·에스컬레이션 경로.

**선택 규칙**
1. 출처에 비상연락망/운영매뉴얼 문서가 있으면 해당 문서 내용만 사용합니다.
2. 없을 때만 메일/티켓에서 담당자 정보를 추출하고 `(메일 추론)` 을 표기합니다.
3. 둘 다 없으면 `없음`.

## 🔑 서버 접속 정보
대상 서버/호스트, 접속 방법(IP·포트·VPN), 계정 정보.
⚠️ 비밀번호·인증키·SSH private key 등 민감 정보는 절대 출력하지 않습니다. 해당 항목은 `운영 문서 참조` 로만 표기합니다.
없으면 `없음`.

## 📋 최근 작업 이력
최근 작업 공지/작업결과서. `- [날짜] 내용 (담당)` 형식으로. 없으면 `없음`.

## 🛠️ 모니터링 알람 조치 가이드
알람 유형에 따른 조치 절차를 단계별로. 없으면 `없음`.

## 📨 장애 관련 최근 메일
장애/보안 이벤트/관제 관련 최근 메일을 `- [날짜] 제목 — 발신자: 요약` 형식으로. 없으면 `없음`."""


def format_context(sources: list) -> str:
    """검색 결과를 LLM 컨텍스트로 포맷"""
    if not sources:
        return "관련 문서를 찾지 못했습니다."
    lines = []
    for i, src in enumerate(sources, 1):
        customer = src.get("customer_name", "") if isinstance(src, dict) else ""
        customer_prefix = f"[{customer}] " if customer else ""
        section = src.get("section_title", "") if isinstance(src, dict) else ""
        section_part = f' | 섹션: "{section}"' if section else ""
        title = src.get("title", "") if isinstance(src, dict) else getattr(src, "title", "")
        content = src.get("content", "") if isinstance(src, dict) else getattr(src, "content", "")
        lines.append(
            f'[출처{i}] {customer_prefix}문서: "{title}"{section_part}\n{content}'
        )
    return "\n\n".join(lines)


async def generate_stream(
    messages: list,
    context_sources: list,
    conversation_history: list | None = None,
) -> AsyncIterator[str]:
    """OpenAI GPT-4o-mini 스트리밍 응답 (SYSTEM_PROMPT + 5섹션 양식 적용)"""
    context = format_context(context_sources)
    system_content = SYSTEM_PROMPT + f"\n\n===참고 문서===\n{context}\n==============="

    lc_messages = [SystemMessage(content=system_content)]

    if conversation_history:
        for msg in conversation_history[-6:]:
            role = msg.get("role", "user")
            if role == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))
            else:
                lc_messages.append(HumanMessage(content=msg["content"]))

    for msg in messages:
        if msg.get("role") == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))
        else:
            lc_messages.append(HumanMessage(content=msg["content"]))

    async for chunk in _llm.astream(lc_messages):
        if chunk.content:
            yield chunk.content


async def classify_query_complexity(query: str) -> dict:
    """질의 복잡도 분류 (Simple vs Complex)"""
    import openai

    client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "MSP 운영 시스템의 질의 분류기입니다. "
                        "사용자 질문이 Simple인지 Complex인지 판단하고 JSON으로만 응답하세요.\n\n"
                        "Simple: 단일 주제, 직접 정보 요청 (비상연락망 조회, 담당자 연락처 등)\n"
                        "Complex: 비교/이력/다단계 추론, 여러 문서 종합 필요\n\n"
                        '응답 형식 (JSON만): {"type":"simple"|"complex","reason":"한 문장 이유"}'
                    ),
                },
                {"role": "user", "content": query},
            ],
            response_format={"type": "json_object"},
            max_tokens=150,
        )
        return json.loads(resp.choices[0].message.content or '{"type":"simple","reason":"분류 실패"}')
    except Exception as e:
        logger.warning("질의 분류 실패: %s — simple로 처리", e)
        return {"type": "simple", "reason": "분류 실패 — simple로 처리"}


async def get_llm_stream(query: str, chunks: list) -> AsyncIterator[str]:
    """기존 호환용 단순 스트리밍."""
    sources = []
    for c in chunks:
        if isinstance(c, dict):
            sources.append(c)
        else:
            sources.append({
                "title": c.document.title if c.document else "알 수 없음",
                "content": c.content,
                "section_title": getattr(c, "section_title", None),
                "customer_name": c.document.customer_id if c.document else None,
            })
    async for token in generate_stream(
        messages=[{"role": "user", "content": query}],
        context_sources=sources,
    ):
        yield token
