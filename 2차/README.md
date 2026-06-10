# MSP Archive Platform — 2차 병합 버전

> **1차 병합(merged)**에 팀원 코드를 추가로 통합한 버전입니다.  
> LLM: OpenAI GPT-4o-mini | 임베딩: HuggingFace API (BAAI/bge-m3)

---

## 1. 프로젝트 개요

### 1차에서 추가된 기능

| 구분 | 1차 (merged) | 2차 (이 버전) |
|------|-------------|--------------|
| **RAG 방식** | 단순 하이브리드 검색 → LLM | **Adaptive RAG** — Simple/Complex 자동 라우팅 + 에스컬레이션 |
| **LLM 응답 양식** | 자유 형식 | **5섹션 고정 양식** (비상연락망·서버접속·작업이력·조치가이드·관련메일) |
| **고객사 관리** | 문서에 문자열로만 기록 | **Customer CRUD API** — 고객사 등록/수정/삭제/별칭 관리 |
| **모니터링 알람** | 없음 | **Alert Webhook** — Zabbix/Grafana 알람 수신 → 조치가이드 자동 생성 |
| **HWP 파싱** | 없음 | **HWP 5.0 지원** (pyhwp / hwp5txt CLI) |
| **문서 처리 방식** | BackgroundTask (동기) | 기존 유지 + **ARQ 비동기 워커** 추가 |
| **처리 진행 상황** | 없음 | **SSE 실시간 스트림** (`/documents/{id}/progress`) |
| **대화 관리** | GET 단일 엔드포인트만 | **대화 CRUD** — 생성/목록/조회/수정/삭제 |
| **채팅 이벤트** | 단순 토큰 스트림 | SSE로 routing/agent_step/sources/complete 이벤트 분리 전달 |
| **채팅 피드백** | 없음 | 메시지별 👍👎 피드백 (`/messages/{id}/feedback`) |
| **시스템 대시보드** | `/health` 단순 ping | **System API** — 헬스 체크(DB/Redis/OpenAI/HF), 통계, 작업 로그 |
| **Zammad 연동** | 없음 | `scripts/zammad_collector.py` — SR 티켓 자동 수집 |
| **문서 버전 관리** | 없음 | `version_group_id` + `is_latest` 필드 |
| **검색 범위** | 단순 필터 없음 | customer_id 기반 필터링 + 전 고객사 크로스 검색 |
| **인프라** | Postgres + Backend + Frontend (3개) | + **Redis** + **ARQ 워커** 컨테이너 추가 (5개) |

> **제외된 기능** (1차에 있었으나 2차에 포함하지 않음): 이메일 수집, 사용자 인증 확장, 보안 이벤트 관리, 지식 그래프

---

## 2. 기술 스택

### Backend
- **Framework**: FastAPI (Python 3.12)
- **ORM**: SQLAlchemy (sync)
- **Database**: PostgreSQL 15 + pgvector + PGroonga
- **LLM**: OpenAI GPT-4o-mini (`langchain_openai.ChatOpenAI.astream()`)
- **쿼리 복잡도 분류**: `openai.AsyncOpenAI` + JSON mode
- **Embedding**: BAAI/bge-m3 via HuggingFace API (Dense 1024차원)
- **비동기 워커**: ARQ (Redis 기반 작업 큐)
- **문서 파싱**: PyMuPDF, python-docx, python-pptx, openpyxl, pyhwp (HWP 5.0)
- **인증**: JWT (HS256), bcrypt, Fernet

### Infrastructure
- **Container**: Docker + Docker Compose (5개 서비스)
- **Message Broker**: Redis 7 (ARQ 큐 + pub/sub 진행 상황)

---

## 3. 프로젝트 구조

```
2차/
├── app/
│   ├── api/v1/
│   │   ├── chat.py          # 대화 CRUD + Adaptive RAG SSE + 피드백 (전면 재작성)
│   │   ├── customers.py     # 고객사 CRUD API (신규)
│   │   ├── alerts.py        # 모니터링 알람 웹훅 (신규)
│   │   ├── system.py        # 시스템 헬스/통계/작업 로그 (신규)
│   │   ├── data.py          # + 문서 처리 진행 상황 SSE 추가
│   │   └── ...
│   ├── models/
│   │   ├── customer.py      # Customer, CustomerAlias 모델 (신규)
│   │   ├── job_log.py       # ARQ 작업 로그 모델 (신규)
│   │   ├── document.py      # + version_group_id, is_latest, source_type
│   │   ├── document_chunk.py    # + section_title
│   │   ├── message.py       # + sources, route_type, feedback, tool_calls
│   │   └── conversation.py  # + search_mode, updated_at
│   ├── services/
│   │   ├── agent.py         # Adaptive RAG 엔진 (신규)
│   │   ├── llm.py           # SYSTEM_PROMPT 5섹션 + generate_stream (전면 재작성)
│   │   └── retrieval.py     # hybrid_search → list[dict] + cross_search (업데이트)
│   └── worker/
│       ├── tasks.py             # ARQ process_document 태스크 (신규)
│       └── parsers/
│           ├── base.py          # ParseResult, ParsedSection dataclass
│           └── hwp_parser.py    # HWP 5.0 파서
├── scripts/
│   └── zammad_collector.py      # Zammad SR 티켓 수집기 (신규)
├── docker-compose.yml           # Redis + Worker 추가
├── requirements.txt             # arq, redis, pyhwp, openai 추가
└── .env.example
```

---

## 4. 실행 방법

### 환경 설정

```bash
cp .env.example .env
# OPENAI_API_KEY, HF_TOKEN, SECRET_KEY 입력
```

### 실행

```bash
# 전체 빌드 (5개 서비스)
docker-compose up --build -d

# 서비스 상태 확인
docker-compose ps

# Zammad 티켓 수집 (선택)
docker-compose exec backend python scripts/zammad_collector.py
```

### Docker Compose 서비스 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| `postgres` | 5432 | PostgreSQL 15 + pgvector + PGroonga |
| `redis` | 6379 | Redis 7-alpine (ARQ 큐 + pub/sub) |
| `backend` | 8000 | FastAPI 백엔드 (v2.0.0) |
| `worker` | — | ARQ 비동기 문서 처리 워커 |
| `frontend` | 3000 | Next.js 프론트엔드 |

### 접속

| 서비스 | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |

---

## 5. 업무 로직 및 플로우

### 5.1 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Docker Compose (5 services)                       │
│                                                                      │
│  ┌─────────────────┐    ┌────────────────────────────────────────┐   │
│  │    Frontend      │───▶│           FastAPI Backend              │   │
│  │  (Next.js 14)   │    │             (port 8000)                │   │
│  │  (port 3000)    │    └────────────────┬───────────────────────┘   │
│  └─────────────────┘                    │                           │
│                                         │                           │
│                          ┌──────────────▼──────────────────────┐   │
│                          │          PostgreSQL 15               │   │
│                          │    pgvector + PGroonga               │   │
│                          │          (port 5432)                 │   │
│                          └──────────────────────────────────────┘   │
│                                         │                           │
│                          ┌──────────────▼──────────────────────┐   │
│                          │           Redis 7                    │   │
│                          │  ARQ 작업 큐 + pub/sub 진행 상황     │   │
│                          │          (port 6379)                 │   │
│                          └──────────────┬───────────────────────┘   │
│                                         │                           │
│                          ┌──────────────▼──────────────────────┐   │
│                          │          ARQ Worker                  │   │
│                          │  process_document 비동기 처리        │   │
│                          └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
          ▲                                      ▲
          │                                      │
┌─────────┴────────┐                  ┌──────────┴────────┐
│  Zabbix/Grafana  │                  │  External APIs    │
│  Alert Webhook   │                  │  OpenAI API       │
│  (POST /alerts)  │                  │  HuggingFace API  │
│                  │                  │  Zammad API       │
└──────────────────┘                  └───────────────────┘
```

---

### 5.2 문서 업로드 → ARQ 처리 → 검색 → Adaptive RAG 답변 전체 플로우

#### Phase 1: 문서 업로드

```
사용자 (Frontend /documents)
  │
  ▼
POST /api/v1/upload
  │
  ▼
[data.py] upload_document()
  ├── 1. SHA-256 해시 계산 (중복 감지)
  ├── 2. uploads/ 폴더에 원본 파일 저장
  ├── 3. Document 레코드 생성 (processing_status="pending")
  │      Document(
  │        title, file_path, file_hash,
  │        customer_id, source_type, is_latest=True
  │      )
  └── 4. ARQ 워커에 process_document 태스크 enqueue
         → Redis 큐 (arq:queue)에 job 등록
```

#### Phase 2: ARQ 비동기 문서 처리

```
[worker/tasks.py] process_document(ctx, document_id)
  │
  │  ※ Redis pub/sub 채널: doc_progress:{document_id}
  │  ※ 동기 DB 작업은 run_in_executor로 실행 (sync SQLAlchemy)
  │
  ├── Step 1. 문서 조회
  │     DB에서 Document 레코드 fetch
  │     Document.processing_status → "processing"
  │
  ├── Step 2. 파싱 [publish: parsing/in_progress → completed]
  │     [document_parser.py] parse_document(file_path)
  │       ├── PDF  → PyMuPDF(fitz): 페이지별 get_text()
  │       ├── DOCX → python-docx: 헤딩/문단별 추출
  │       ├── PPTX → python-pptx: 슬라이드 텍스트 + 테이블
  │       ├── XLSX → openpyxl: 행을 "헤더: 값" 형태로 변환
  │       ├── HWP  → hwp5txt CLI: 텍스트 추출 (pyhwp 패키지)
  │       └── TXT/EML → 직접 읽기
  │     → 보호/미지원 파일: meta_only=True → "blocked" 상태로 종료
  │
  ├── Step 3. 청킹 [publish: chunking/in_progress → completed]
  │     [chunking.py] chunk_sections(sections)
  │     → 섹션 경계 기반 적응형 분할 (~1000자, section_title 보존)
  │     → ParsedChunk(content, chunk_index, section_title) 리스트 반환
  │
  ├── Step 4. 임베딩 [publish: embedding/in_progress → completed]
  │     [embedding.py] embed_texts(chunk_texts)
  │     → HuggingFace API 배치 호출 (batch_size=32)
  │     → Dense vector (1024차원) 반환
  │
  ├── Step 5. 저장 [publish: finalizing/in_progress → completed]
  │     DocumentChunk 레코드 일괄 INSERT
  │       (content, chunk_index, section_title, dense_vector)
  │     Document.processing_status → "completed"
  │     Document.indexing_status   → "indexed"
  │     JobLog 성공 기록
  │
  └── Step 6. 완료 [publish: complete/completed]
       → 구독 중인 SSE 클라이언트에게 done 이벤트 전달
```

#### Phase 3: 하이브리드 검색

```
[retrieval.py] hybrid_search(query, db, top_k=10, k=60, customer_id=None)
  │
  ├── 1. 쿼리 임베딩 생성
  │      embed_texts([query]) → query_vector (1024차원)
  │
  ├── 2. Dense 검색 (pgvector 코사인 거리)
  │      SELECT id, (embedding <=> query_vector::vector) AS dist
  │      FROM document_chunks [WHERE document.customer_id = ?]
  │      ORDER BY dist LIMIT top_k*3
  │      → list[(DocumentChunk, cosine_distance)]
  │
  ├── 3. Sparse 검색 (pgvector sparsevec)
  │      SELECT id FROM document_chunks
  │      WHERE sparse_embedding IS NOT NULL
  │      ORDER BY sparse_embedding <=> query_sparse LIMIT top_k*3
  │
  ├── 4. RRF (Reciprocal Rank Fusion)
  │      score = Σ weight_i / (rank_i + k)
  │      → 세 채널 순위를 융합하여 최종 랭킹 결정
  │
  └── 5. 상위 top_k 반환 (list[dict])
         {chunk_id, document_id, title, section_title,
          content, customer_name, score, dense_score}

cross_search(query, db, top_k=5)
  └── customer_id=None 으로 hybrid_search 호출 (전 고객사 검색)
```

#### Phase 4: Adaptive RAG 채팅

```
POST /api/v1/chat/conversations/{id}/messages
  │  {"content": "서버 장애 대응 절차는?"}
  │
  ▼
[chat.py] send_message() → SSE StreamingResponse
  │
  ▼
[agent.py] adaptive_rag(session, query, customer_id, search_mode, history)
  │
  ├── 1. 질의 복잡도 분류
  │     [llm.py] classify_query_complexity(query)
  │       → openai.AsyncOpenAI (JSON mode)
  │       → {"type": "simple"|"complex", "reason": "..."}
  │     SSE yield: event:routing {"type": "simple", "reason": "..."}
  │
  ├── 2. 1차 하이브리드 검색
  │     search_mode="single" → customer_id 필터 적용
  │     search_mode="all"    → customer_id=None (전 고객사)
  │     hybrid_search(query, session, customer_id=search_customer)
  │     → results (list[dict], dense_score 포함)
  │     [Complex일 때] SSE yield: event:agent_step {step:1, tool:hybrid_search}
  │
  ├── 3. 에스컬레이션 판단
  │     top_score = results[0]["dense_score"]  (결과 없으면 0.0)
  │     │
  │     ├── route_type == "simple" AND top_score < 0.3
  │     │     → route_type을 "complex"로 승격
  │     │     SSE yield: event:routing {type:"complex", reason:"검색 결과 부족..."}
  │     │
  │     └── 조건 불충족 → 그대로 진행
  │
  ├── 4. Complex 경로 추가 검색 (cross_search)
  │     top_score < ESCALATION_THRESHOLD(0.3)인 경우에만 실행
  │     hybrid_search(query, session, customer_id=None, top_k=5)
  │     → 기존 results에 중복 없이 병합
  │     SSE yield: event:agent_step {step:2, tool:cross_search}
  │     results를 최대 10개로 truncate
  │
  ├── 5. LLM 스트리밍 답변 생성
  │     [llm.py] generate_stream(messages, context_sources, history)
  │       → ChatOpenAI(gpt-4o-mini).astream()
  │       → SYSTEM_PROMPT (5섹션 MSP 고정 양식)
  │       → 컨텍스트: format_context(sources) 로 조립
  │     토큰마다 SSE yield: event:stream {"content": "토큰..."}
  │
  ├── 6. 출처 정보 전달
  │     SSE yield: event:sources {"sources": [...]}
  │
  └── 7. 완료
       SSE yield: event:complete {"route_type", "tool_calls", ...}
       → Message(role="assistant", content, sources, route_type) DB 저장

LLM 응답 고정 양식 (SYSTEM_PROMPT):
  🚨 비상연락망       — 담당자 및 긴급 연락처
  🔑 서버접속정보     — 접속 방법, IP, 계정 정보
  📋 최근작업이력     — 관련 작업 이력
  🛠️ 조치가이드       — 단계별 대응 절차
  📨 최근메일         — 관련 이메일 내용
  → 정보 없는 섹션은 "해당 정보 없음"으로 표시
```

#### 전체 End-to-End 요약

```
[업로드]                [ARQ 처리]                    [검색/답변]

사용자 파일 업로드       ARQ 워커 자동 처리              사용자 질문 입력
     │                        │                               │
     ▼                        ▼                               ▼
Document 레코드 생성     파싱(PDF/DOCX/HWP/…)           쿼리 임베딩 생성
     │                        │                               │
     ▼                        ▼                               ▼
Redis 큐에 job 등록      섹션 기반 청킹              복잡도 분류(Simple/Complex)
                              │                               │
Redis pub/sub ◀──────── 진행 상황 발행              하이브리드 검색
     │                        │                      (customer_id 필터)
     ▼                        ▼                               │
SSE progress 스트림      임베딩 생성                 dense_score < 0.3?
(Frontend에 실시간)      (HuggingFace API)                    │
                              │                         Yes ──▼
                              ▼                        크로스 검색 에스컬레이션
                        DocumentChunk 저장             (전 고객사 검색)
                        (pgvector)                             │
                                                              ▼
                                                    GPT-4o-mini 답변 생성
                                                    (5섹션 MSP 고정 양식)
                                                              │
                                                              ▼
                                                    SSE 스트리밍으로 실시간 전달
                                                    (routing→stream→sources→complete)
```

---

### 5.3 모니터링 알람 웹훅 플로우

Zabbix, Grafana 등 모니터링 시스템이 장애를 감지하면 Archive가 자동으로 조치 가이드를 생성합니다.

```
Zabbix/Grafana (장애 감지)
  │
  ▼
POST /api/v1/alerts/guide
  {
    "host": "web-server-01",
    "service": "HTTP",
    "severity": "HIGH",
    "message": "Connection refused",
    "customer": "고객사명"
  }
  │
  ▼
[alerts.py] alert_guide()
  │
  ├── 1. 고객사 자동 매칭
  │     DB에서 is_active=True 고객사 전체 조회
  │     name/code/alias와 req.customer를 퍼지 매칭
  │     → customer_code 결정 (없으면 None)
  │
  ├── 2. 알람 전용 Conversation 생성
  │     title = "알람 [HTTP @ web-server-01]"
  │     customer_id = customer_code
  │
  ├── 3. 호스트 사전 검색
  │     hybrid_search(req.host, db, customer_id=customer_code, top_k=5)
  │     → req.host가 포함된 문서 발췌 추출
  │     → query에 "[호스트 매칭 발췌]" 섹션으로 첨부
  │
  ├── 4. 비상연락망 사전 검색
  │     hybrid_search("비상연락망 담당자 연락처 에스컬레이션", db, ...)
  │     → query에 "[비상연락망 문서 발췌]" 섹션으로 첨부
  │
  ├── 5. user 메시지 DB 저장 (보강된 query 내용)
  │
  ├── 6. Adaptive RAG 실행 (별도 SessionLocal)
  │     adaptive_rag(session=rag_db, query=query, ...)
  │     → Simple/Complex 라우팅 + 5섹션 답변 생성 (스트리밍 이벤트 수집)
  │
  ├── 7. assistant 메시지 DB 저장
  │     Message(role="assistant", content=guide, sources, route_type)
  │
  └── 8. 응답 반환
       {
         "success": true,
         "data": {
           "conversation_id": "uuid",
           "title": "알람 [HTTP @ web-server-01]",
           "guide": "🚨 비상연락망\n...",
           "sources": [...]
         }
       }
```

---

### 5.4 Zammad SR 티켓 수집 플로우

```
scripts/zammad_collector.py
  │
  ├── 1. 환경변수 확인
  │     ZAMMAD_API_URL, ZAMMAD_API_TOKEN 필요
  │
  ├── 2. Zammad API로 티켓 목록 조회 (페이지네이션)
  │     GET /api/v1/tickets?per_page=100&page=N&expand=true
  │     → 최대 MAX_TICKETS(기본 500)건 수집
  │
  ├── 3. 각 티켓의 아티클(댓글/메시지) 조회
  │     GET /api/v1/ticket_articles/by_ticket/{ticket_id}
  │     → HTML → 텍스트 변환 (내장 HTMLParser)
  │
  ├── 4. 고객사 자동 분류
  │     auto_classify_customer(db, ticket.customer)
  │     → Customer.name / Customer.code / CustomerAlias.alias 퍼지 매칭
  │     → customer_id (code) 결정 (없으면 "unclassified")
  │
  ├── 5. 전문 텍스트 생성
  │     제목, 티켓번호, 상태, 우선순위, 담당그룹, 고객, 생성일
  │     + 대화 내역 (발신자, 시각, 내용)
  │     → SHA-256 해시로 중복 체크
  │
  ├── 6. 텍스트 파일 저장 + Document 레코드 생성
  │     uploads/zammad/{customer_id}/{hash[:16]}.txt
  │     Document(
  │       doc_type="zammad", source_type="zammad",
  │       processing_status="pending"  ← ARQ 워커가 이후 자동 처리
  │     )
  │
  └── 7. 완료 보고
       "N개 저장, M개 스킵(중복)"
       → pending 상태 문서는 ARQ 워커가 자동으로 임베딩 처리
```

---

### 5.5 문서 처리 진행 상황 SSE 플로우

```
사용자 (Frontend)
  │
  ▼
GET /api/v1/documents/{document_id}/progress
  │
  ▼
[data.py] document_progress()  → SSE StreamingResponse
  │
  ├── Redis pub/sub 구독 시도
  │     channel: doc_progress:{document_id}
  │     │
  │     ├── ARQ 워커가 publish하는 이벤트 수신
  │     │     {"step": "parsing|chunking|embedding|finalizing|complete",
  │     │      "status": "in_progress|completed|failed",
  │     │      "message": "..."}
  │     │         │
  │     │         ▼
  │     │   SSE yield: event:progress {"step", "pct", "message"}
  │     │
  │     └── "complete" 이벤트 수신 시 → SSE yield: event:done → 종료
  │
  └── Redis 연결 실패 / 타임아웃 시 DB 폴링 fallback
        2초 간격으로 Document.processing_status 조회
        최대 120초 대기
        → "completed"/"failed"/"blocked" 감지 시 SSE done/error 전송
```

---

## 6. 주요 API 엔드포인트

### 고객사 관리

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/customers` | 전체 목록 |
| POST | `/api/v1/customers` | 등록 `{ name, code, description }` |
| GET | `/api/v1/customers/{id}` | 상세 조회 |
| PATCH | `/api/v1/customers/{id}` | 수정 |
| DELETE | `/api/v1/customers/{id}` | 삭제 |
| POST | `/api/v1/customers/{id}/aliases` | 별칭 추가 |
| DELETE | `/api/v1/customers/{id}/aliases/{alias_id}` | 별칭 삭제 |

### 대화 / Adaptive RAG

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/chat/conversations` | 대화 생성 |
| GET | `/api/v1/chat/conversations` | 목록 (최근 20개) |
| GET | `/api/v1/chat/conversations/{id}` | 메시지 포함 조회 |
| PATCH | `/api/v1/chat/conversations/{id}` | 제목 수정 |
| DELETE | `/api/v1/chat/conversations/{id}` | 삭제 |
| POST | `/api/v1/chat/conversations/{id}/messages` | 메시지 전송 **(SSE)** |
| POST | `/api/v1/chat/messages/{id}/feedback` | 피드백 `{ value: "up"\|"down" }` |
| GET | `/api/v1/chat/completions` | 레거시 GET 스트리밍 |

### 모니터링 알람

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/alerts/guide` | 알람 수신 → 조치 가이드 생성 |

### 문서 처리 진행

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/documents/{id}/progress` | SSE 처리 진행 상황 |

### 시스템

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/system/health` | DB/Redis/OpenAI/HuggingFace 상태 |
| GET | `/api/v1/system/stats` | 문서/고객사 통계 |
| GET | `/api/v1/system/jobs` | ARQ 작업 로그 |

---

## 7. 데이터 모델

```
Customer (고객사)
 ├── id (INT PK), name, code (UNIQUE), description, is_active
 └── CustomerAlias
      └── alias (UNIQUE), customer_id (FK)

Document (문서) — 1차 대비 추가 컬럼
 ├── ...기존 컬럼...
 ├── version_group_id (UUID, nullable) — 동일 파일의 버전 그룹
 ├── is_latest (BOOLEAN, DEFAULT TRUE)
 └── source_type (VARCHAR 50, nullable) — "zammad", "upload" 등

DocumentChunk (청크 + 임베딩) — 1차 대비 추가 컬럼
 ├── ...기존 컬럼...
 └── section_title (VARCHAR 500, nullable) — 파싱된 섹션 제목

Conversation (대화 세션) — 1차 대비 추가 컬럼
 ├── ...기존 컬럼...
 ├── search_mode (VARCHAR 20, DEFAULT "single")
 └── updated_at (TIMESTAMPTZ, auto-update)

Message (채팅 메시지) — 1차 대비 추가 컬럼
 ├── ...기존 컬럼...
 ├── sources (JSONB, nullable) — 참조 문서 목록
 ├── route_type (VARCHAR 20, nullable) — "simple" | "complex"
 ├── feedback (VARCHAR 10, nullable) — "up" | "down"
 └── tool_calls (INTEGER, DEFAULT 0)

JobLog (ARQ 작업 로그)
 └── job_type, target_id, target_type, status,
     retry_count, error_message, started_at, completed_at
```

> **마이그레이션 자동 처리**: 서버 시작 시 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 자동 적용. 기존 1차 데이터는 그대로 유지됩니다.

---

## 8. 환경변수

`.env.example` 전체 항목:

| 변수 | 필수 | 설명 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 |
| `HF_TOKEN` | ✅ | HuggingFace API 토큰 (BGE-m3 임베딩) |
| `SECRET_KEY` | ✅ | JWT 서명 시크릿 |
| `DATABASE_URL` | ✅ | PostgreSQL 접속 URL |
| `FIRST_ADMIN_EMAIL` | ✅ | 초기 관리자 이메일 |
| `FIRST_ADMIN_PASSWORD` | ✅ | 초기 관리자 비밀번호 |
| `REDIS_URL` | — | Redis 접속 URL (기본: `redis://redis:6379/0`) |
| `ESCALATION_SCORE_THRESHOLD` | — | 에스컬레이션 임계값 (기본: `0.3`) |
| `ZAMMAD_API_URL` | — | Zammad 인스턴스 URL |
| `ZAMMAD_API_TOKEN` | — | Zammad API 토큰 |

---

## 9. 테스트 방법

### API 테스트 (curl)

```bash
# 시스템 헬스 체크
curl http://localhost:8000/api/v1/system/health

# 고객사 등록
curl -X POST http://localhost:8000/api/v1/customers \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name": "삼성전자", "code": "samsung", "description": "삼성전자 MSP"}'

# 대화 생성
curl -X POST http://localhost:8000/api/v1/chat/conversations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "samsung", "search_mode": "single", "title": "테스트 대화"}'

# Adaptive RAG 메시지 전송 (SSE)
curl -N -X POST http://localhost:8000/api/v1/chat/conversations/{conv_id}/messages \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"content": "web-server-01 접속 방법과 비상연락망 알려줘"}'

# 모니터링 알람 수신
curl -X POST http://localhost:8000/api/v1/alerts/guide \
  -H "Content-Type: application/json" \
  -d '{
    "host": "web-server-01",
    "service": "HTTP",
    "severity": "HIGH",
    "message": "Connection refused",
    "customer": "삼성전자"
  }'

# 문서 처리 진행 상황 (SSE)
curl -N "http://localhost:8000/api/v1/documents/{doc_id}/progress" \
  -H "Authorization: Bearer {token}"
```

### 프론트엔드 시연

1. **로그인**: http://localhost:3000/login
2. **문서 업로드**: http://localhost:3000/documents (처리 진행 상황 실시간 확인)
3. **Adaptive RAG 채팅**: http://localhost:3000 (라우팅 유형 + 출처 표시)
4. **고객사 관리**: http://localhost:3000/customers
5. **시스템 모니터링**: http://localhost:3000/admin
