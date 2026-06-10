# MSP Archive Platform — 2차 병합 버전

> **1차 병합(merged)**에 팀원 코드를 추가로 통합한 버전입니다.  
> LLM: OpenAI GPT-4o-mini | 임베딩: HuggingFace API (BAAI/bge-m3)

---

## 1차 vs 2차 주요 차이점

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

> **제외된 기능** (1차에 있었으나 2차에서는 유지하지 않음): 이메일 수집, 사용자 인증 확장, 보안 이벤트 관리, 지식 그래프 — 이 기능들은 1차 버전에서 계속 사용하세요.

---

## Adaptive RAG 동작 방식

```
사용자 질의
    │
    ▼
classify_query_complexity()  ← GPT-4o-mini로 Simple/Complex 판단
    │
    ├─ Simple ──────→ hybrid_search(customer_id) ─→ dense_score >= 0.3? ─→ LLM 응답
    │                                                        │
    │                                              No (0.3 미만)
    │                                                        ▼
    └─ Complex ─────→ hybrid_search(customer_id)            에스컬레이션
                              + cross_search(전 고객사)     ────────────→ LLM 응답
```

- **Simple**: 단일 주제, 직접 정보 요청 (비상연락망, 담당자 연락처 등)
- **Complex**: 비교/이력/다단계 추론, 여러 문서 종합 필요
- **에스컬레이션**: Simple로 분류됐어도 dense_score < 0.3이면 Complex로 자동 승격
- **에스컬레이션 임계값**: `ESCALATION_SCORE_THRESHOLD=0.3` (환경변수로 조정 가능)

---

## LLM 응답 양식 (5섹션)

모든 RAG 답변은 다음 5섹션 형식으로 통일됩니다:

```
🚨 비상연락망       — 담당자 및 긴급 연락처
🔑 서버접속정보     — 접속 방법, IP, 계정 정보
📋 최근작업이력     — 관련 작업 이력
🛠️ 조치가이드       — 단계별 대응 절차
📨 최근메일         — 관련 이메일 내용
```

정보가 없는 섹션은 "해당 정보 없음"으로 표시됩니다.

---

## 신규 API 엔드포인트

### 고객사 관리
```
GET    /api/v1/customers              # 전체 목록
POST   /api/v1/customers              # 등록 { name, code, description }
GET    /api/v1/customers/{id}         # 상세
PATCH  /api/v1/customers/{id}         # 수정
DELETE /api/v1/customers/{id}         # 삭제
POST   /api/v1/customers/{id}/aliases # 별칭 추가 { alias }
DELETE /api/v1/customers/{id}/aliases/{alias_id}  # 별칭 삭제
```

### 모니터링 알람 웹훅
```
POST   /api/v1/alerts/guide
Body:  { host, service, severity, message, customer, search_mode? }
→ 고객사 자동 매칭 후 Adaptive RAG로 5섹션 조치 가이드 반환
```

### 대화 관리 (Adaptive RAG)
```
POST   /api/v1/chat/conversations                       # 대화 생성
GET    /api/v1/chat/conversations                       # 목록 (최근 20개)
GET    /api/v1/chat/conversations/{id}                  # 메시지 포함 조회
PATCH  /api/v1/chat/conversations/{id}                  # 제목 수정
DELETE /api/v1/chat/conversations/{id}                  # 삭제
POST   /api/v1/chat/conversations/{id}/messages         # 메시지 전송 (SSE)
POST   /api/v1/chat/messages/{id}/feedback              # 피드백 { value: "up"|"down" }
GET    /api/v1/chat/completions                         # 레거시 호환 GET 엔드포인트
```

#### SSE 이벤트 형식 (메시지 전송 시)
```
event: routing
data: {"type": "simple"|"complex", "reason": "..."}

event: agent_step
data: {"step": "cross_search", "message": "..."}

event: stream
data: {"content": "토큰..."}

event: sources
data: {"sources": [{"document_id": "...", "title": "...", "score": 0.85}]}

event: complete
data: {"tool_calls": 0}

event: error
data: {"code": "AGENT_ERROR", "message": "..."}
```

### 문서 처리 진행 상황
```
GET    /api/v1/documents/{id}/progress   # SSE 스트림
→ Redis pub/sub 실시간 → DB 폴링(2초 간격, 최대 120초) fallback
```

#### 진행 이벤트 형식
```
event: progress
data: {"step": "parse"|"chunk"|"embed"|"finalize", "pct": 25, "message": "..."}

event: done
data: {"document_id": "..."}

event: error
data: {"message": "..."}
```

### 시스템 모니터링
```
GET    /api/v1/system/health   # 서비스 상태 (DB/Redis/OpenAI/HuggingFace)
GET    /api/v1/system/stats    # 문서 수, 고객사 수, 처리 상태별 통계
GET    /api/v1/system/jobs     # ARQ 작업 로그 목록
```

---

## 신규 환경변수

`.env.example` 기준 추가된 항목:

```bash
# Redis (ARQ 워커, 실시간 SSE, Pub/Sub)
REDIS_URL=redis://redis:6379/0

# Adaptive RAG 에스컬레이션 임계값 (기본 0.3)
# dense_score가 이 값 미만이면 simple → complex로 자동 승격
ESCALATION_SCORE_THRESHOLD=0.3

# Zammad SR 티켓 수집 (선택)
ZAMMAD_API_URL=https://your-zammad-instance/
ZAMMAD_API_TOKEN=your-zammad-api-token
```

---

## 실행 방법

### 사전 요구사항

- Docker & Docker Compose
- OpenAI API Key
- HuggingFace API Token (BGE-m3 임베딩)

### 환경 설정 및 실행

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env에서 OPENAI_API_KEY, HF_TOKEN, SECRET_KEY 입력

# 2. 전체 빌드 및 실행 (5개 서비스)
docker-compose up --build -d

# 3. Zammad 티켓 수집 (선택 — 설정한 경우)
docker-compose exec backend python scripts/zammad_collector.py
```

### Docker Compose 서비스 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| postgres | 5432 | PostgreSQL 15 + pgvector + PGroonga |
| **redis** | **6379** | **Redis 7-alpine (2차 신규)** |
| backend | 8000 | FastAPI 백엔드 (v2.0.0) |
| **worker** | — | **ARQ 비동기 워커 (2차 신규)** |
| frontend | 3000 | Next.js 프론트엔드 |

---

## DB 스키마 변경사항 (자동 마이그레이션)

서버 시작 시 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 자동 적용됩니다. 기존 1차 데이터는 그대로 유지됩니다.

### 신규 테이블

| 테이블 | 설명 |
|--------|------|
| `customers` | 고객사 (id INT PK, name, code UNIQUE, description, is_active) |
| `customer_aliases` | 고객사 별칭 (id, customer_id FK, alias UNIQUE) |
| `job_logs` | ARQ 작업 로그 (job_type, target_id, status, retry_count, error_message) |

### 기존 테이블 컬럼 추가

| 테이블 | 추가 컬럼 |
|--------|----------|
| `documents` | `version_group_id UUID`, `is_latest BOOLEAN DEFAULT TRUE`, `source_type VARCHAR(50)` |
| `document_chunks` | `section_title VARCHAR(500)` |
| `messages` | `sources JSONB`, `route_type VARCHAR(20)`, `feedback VARCHAR(10)`, `tool_calls INTEGER` |
| `conversations` | `search_mode VARCHAR(20) DEFAULT 'single'`, `updated_at TIMESTAMPTZ`, `title` 기본값 변경 |

---

## 기술 스택 변경사항

| 항목 | 변경 내용 |
|------|----------|
| 신규 패키지 | `arq`, `redis`, `pyhwp`, `openai`, `langchain-core` |
| LLM 호출 방식 | `langchain_openai.ChatOpenAI.astream()` (SSE 스트리밍) |
| 쿼리 복잡도 분류 | `openai.AsyncOpenAI` + JSON mode |
| HWP 파싱 | `pyhwp` 패키지 + `hwp5txt` CLI |
| 비동기 워커 | `arq` (Redis 기반 작업 큐) |

---

## 프로젝트 구조 (2차 추가/변경 파일)

```
2차/
├── app/
│   ├── api/v1/
│   │   ├── chat.py        # 대화 CRUD + Adaptive RAG SSE + 피드백 (전면 재작성)
│   │   ├── customers.py   # 고객사 CRUD API (신규)
│   │   ├── alerts.py      # 모니터링 알람 웹훅 (신규)
│   │   ├── system.py      # 시스템 헬스/통계/작업 로그 (신규)
│   │   └── data.py        # + 문서 처리 진행 상황 SSE 엔드포인트 추가
│   ├── models/
│   │   ├── customer.py    # Customer, CustomerAlias 모델 (신규)
│   │   ├── job_log.py     # ARQ 작업 로그 모델 (신규)
│   │   ├── document.py    # + version_group_id, is_latest, source_type
│   │   ├── document_chunk.py  # + section_title
│   │   ├── message.py     # + sources, route_type, feedback, tool_calls
│   │   └── conversation.py   # + search_mode, updated_at, title 기본값
│   ├── services/
│   │   ├── agent.py       # Adaptive RAG 엔진 (신규)
│   │   ├── llm.py         # SYSTEM_PROMPT 5섹션 + generate_stream (전면 재작성)
│   │   └── retrieval.py   # hybrid_search → list[dict] + cross_search (업데이트)
│   └── worker/
│       ├── tasks.py              # ARQ process_document 태스크 (신규)
│       └── parsers/
│           ├── __init__.py       # PARSER_MAP (신규)
│           ├── base.py           # ParseResult, ParsedSection dataclass (신규)
│           └── hwp_parser.py     # HWP 5.0 파서 (신규)
├── scripts/
│   └── zammad_collector.py       # Zammad 티켓 수집기 (신규)
├── docker-compose.yml            # Redis + Worker 추가
├── requirements.txt              # arq, redis, pyhwp 추가
└── .env.example                  # REDIS_URL, ESCALATION_SCORE_THRESHOLD, ZAMMAD_* 추가
```
