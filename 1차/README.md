# MSP Archive Platform (Merged)

개인 프로젝트와 팀원의 코드를 통합하여 재구성한 MSP 운영 아카이브 플랫폼입니다.
문서 업로드부터 벡터 임베딩, 하이브리드 검색, AI 기반 RAG 채팅, 이메일 수집, 보안 이벤트 관리까지 통합 제공합니다.

---

## 1. 프로젝트 개요

### 해결하는 문제

MSP 운영팀이 다수의 고객사 인프라를 관리하면서 겪는 어려움을 해결합니다:

- 운영 문서(매뉴얼, 절차서)가 분산되어 있어 필요할 때 즉시 참조가 불가
- 과거 유사 장애의 원인/해결 방법이 담당자 개인 지식에 의존
- 고객사로부터 받은 이메일 정보가 체계적으로 관리되지 않음
- 보안 이벤트 이력이 기록되지 않아 패턴 분석 및 재발 방지가 어려움

### 주요 기능

| 기능 | 설명 |
|------|------|
| **문서 아카이브** | 운영 문서 업로드 → 텍스트 추출 → 청킹 → 벡터 임베딩 → 검색 가능 상태 자동 처리 |
| **하이브리드 검색** | Dense(의미) + Sparse(어휘) + PGroonga(키워드) 검색을 RRF로 융합 |
| **RAG 채팅** | 검색된 문서를 컨텍스트로 GPT-4o-mini가 스트리밍 답변 생성 |
| **이메일 관리** | POP3/IMAP 이메일 수집, 도메인 기반 고객사 자동 분류 |
| **보안 이벤트 관리** | 이벤트 목록/상태 관리(OPEN→RESOLVED) 및 조치 기록 |
| **지식 그래프** | 문서 간 엔티티 관계 시각화 (BFS 탐색) |
| **사용자 인증** | JWT 기반 인증, admin/user 역할 분리 |
| **감사 로그** | 모든 API 호출에 대한 감사 추적 |

---

## 2. 기술 스택

### Backend
- **Framework**: FastAPI (Python 3.12)
- **ORM**: SQLAlchemy (sync)
- **Database**: PostgreSQL 15 + pgvector + PGroonga
- **Vector DB**: pgvector (Dense: `vector(1024)`)
- **Keyword Search**: PGroonga (한국어 형태소 분석 지원)
- **LLM**: OpenAI GPT-4o-mini (스트리밍 SSE)
- **Embedding**: BAAI/bge-m3 via HuggingFace API (Dense 1024차원)
- **문서 파싱**: PyMuPDF (PDF), python-docx (DOCX), python-pptx (PPTX), openpyxl (XLSX)
- **이메일**: poplib/imaplib (POP3/IMAP), RFC 822 파싱
- **인증**: JWT (HS256, 8시간 만료), bcrypt, Fernet (이메일 비밀번호 암호화)

### Frontend
- **Framework**: Next.js 14 (React 18, TypeScript)
- **Styling**: Tailwind CSS
- **State/Fetching**: SWR, Fetch API
- **UI Components**: Radix UI, Lucide icons
- **그래프 시각화**: react-force-graph

### Infrastructure
- **Container**: Docker + Docker Compose (3개 서비스)
- **File Storage**: 로컬 파일시스템 (`uploads/`)

---

## 3. 프로젝트 구조

```
msp-archive-merged/
├── app/                              # Backend (FastAPI)
│   ├── main.py                       # FastAPI 앱 초기화, 라우터 등록, 시작 훅
│   ├── api/
│   │   ├── deps.py                   # OAuth2 의존성 (get_current_user, get_current_admin)
│   │   └── v1/
│   │       ├── auth.py               # 로그인, 사용자 CRUD, 메일 계정 설정
│   │       ├── data.py               # 문서 업로드/폴더 관리
│   │       ├── search.py             # 하이브리드 검색 (Dense+Sparse+Keyword)
│   │       ├── chat.py               # RAG 채팅 (스트리밍 SSE)
│   │       ├── email.py              # 이메일 수집/목록/상세
│   │       ├── events.py             # 보안 이벤트 CRUD
│   │       └── graph.py              # 지식 그래프 컨텍스트 (BFS)
│   ├── core/
│   │   ├── config.py                 # DB URL, Redis, Ollama, Gotenberg 엔드포인트
│   │   ├── security.py               # JWT 토큰, bcrypt, Fernet 암호화
│   │   ├── embedding.py              # BAAI/bge-m3 임베딩 (HuggingFace API, 배치 처리)
│   │   └── arq_worker.py             # 백그라운드 태스크 큐 워커
│   ├── db/
│   │   ├── session.py                # SQLAlchemy 세션 & 엔진
│   │   ├── base.py                   # ORM 메타데이터 (전체 모델 등록)
│   │   └── base_class.py             # Base 모델 클래스
│   ├── models/                       # SQLAlchemy ORM 모델 (17개 테이블)
│   │   ├── user.py                   # User (email, role: admin/user)
│   │   ├── user_mail_config.py       # POP3/IMAP 자격증명 (Fernet 암호화)
│   │   ├── document.py               # Document (파일 메타데이터, 처리 상태, owner)
│   │   ├── document_chunk.py         # 텍스트 청크 + pgvector 임베딩 (1024차원)
│   │   ├── document_relation.py      # 엔티티 관계 (지식 그래프용)
│   │   ├── manual_refined_document.py # 수동 문서 정제본
│   │   ├── event_occurrence.py       # 보안 이벤트/인시던트
│   │   ├── event_state_history.py    # 이벤트 상태 변경 이력
│   │   ├── event_handling_record.py  # 이벤트 조치 기록
│   │   ├── event_assessment.py       # 이벤트 위험도 평가
│   │   ├── audit_log.py              # 감사 로그
│   │   ├── conversation.py           # 채팅 세션
│   │   ├── message.py                # 채팅 메시지
│   │   ├── incident_case.py          # 인시던트 케이스
│   │   ├── metric_log_evidence.py    # 지표 로그 증거
│   │   └── sanitized_knowledge.py    # 정제 지식
│   └── services/
│       ├── data_processor.py         # 문서 처리 파이프라인 (파싱→청킹→임베딩→저장)
│       ├── document_parser.py        # 구조적 파싱 (PDF, DOCX, PPTX, XLSX)
│       ├── chunking.py               # 섹션 기반 적응형 청킹
│       ├── email_fetcher.py          # POP3/IMAP 이메일 수집, RFC 822 파싱
│       ├── llm.py                    # OpenAI GPT-4o-mini 스트리밍
│       ├── retrieval.py              # 하이브리드 검색 (Dense+Sparse+RRF)
│       └── gotenberg_client.py       # 레거시 포맷 변환 (.doc/.ppt → 현대 포맷)
├── frontend/                         # Frontend (Next.js 14)
│   ├── app/
│   │   ├── layout.tsx                # 루트 레이아웃 (AuthProvider)
│   │   ├── page.tsx                  # 홈: RAG 채팅 + 소스 인스펙터
│   │   ├── documents/page.tsx        # 문서 관리 (업로드, 정리, 삭제)
│   │   ├── email/page.tsx            # 이메일 수집 & 브라우징
│   │   ├── search/page.tsx           # 고급 검색 UI
│   │   ├── events/page.tsx           # 보안 이벤트 추적
│   │   ├── graph/page.tsx            # 지식 그래프 시각화
│   │   ├── admin/page.tsx            # 사용자 관리 (관리자 전용)
│   │   └── login/page.tsx            # 로그인
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # 메인 앱 컨테이너 (사이드바 포함)
│   │   │   ├── Header.tsx            # 상단 네비게이션
│   │   │   └── Sidebar.tsx           # 페이지 네비게이션 메뉴
│   │   ├── FileUpload.tsx            # 드래그앤드롭 파일 업로더
│   │   ├── DocumentDetailPanel.tsx   # 문서 내용 + 메타데이터 패널
│   │   └── MailConfigModal.tsx       # POP3/IMAP 계정 설정 폼
│   ├── contexts/
│   │   └── AuthContext.tsx           # 사용자 인증 상태 전역 관리
│   └── lib/
│       └── apiFetch.ts               # JWT Bearer 토큰 HTTP 클라이언트
├── docker/
│   └── postgres/
│       ├── Dockerfile                # PostgreSQL 15 + pgvector + PGroonga
│       └── init.sql                  # pgvector/pgroonga 확장 초기화
├── uploads/                          # 업로드 파일 로컬 저장소
├── process_emails.py                 # 이메일 배치 처리 CLI 스크립트
├── customer_domain_map.json          # 도메인 → 고객사 분류 매핑
├── docker-compose.yml                # 3개 서비스 오케스트레이션
├── Dockerfile                        # Backend Docker 이미지 (Python 3.12-slim)
├── requirements.txt                  # Python 의존성
└── .env.example                      # 환경 변수 템플릿
```

---

## 4. 실행 방법

### 사전 요구사항

- Docker & Docker Compose (v1.25+ 또는 Docker Compose V2)
- OpenAI API Key (RAG 채팅용)
- HuggingFace API Token (BGE-m3 임베딩용)

### 환경 설정

```bash
# 1. 저장소 클론
git clone https://github.com/woojoongkim-sour/msp-archive-platform-merged.git
cd msp-archive-platform-merged

# 2. .env 파일 생성
cp .env.example .env

# 3. .env 파일에서 API 키 및 시크릿 설정
vi .env
```

#### .env 주요 설정값

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OPENAI_API_KEY` | (필수) | OpenAI API 키 |
| `HF_TOKEN` | (필수) | HuggingFace API 토큰 (BGE-m3 임베딩) |
| `SECRET_KEY` | (필수) | JWT 서명 시크릿 키 (랜덤 문자열 권장) |
| `DATABASE_URL` | `postgresql://user:password@postgres/msp_archive` | PostgreSQL 접속 URL |
| `FIRST_ADMIN_EMAIL` | `admin@example.com` | 최초 실행 시 자동 생성되는 관리자 이메일 |
| `FIRST_ADMIN_PASSWORD` | (필수) | 초기 관리자 비밀번호 |

### 실행

```bash
# 전체 서비스 빌드 및 실행 (3개 서비스)
docker-compose up --build -d

# 서비스 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f backend
```

### Docker Compose 서비스 구성 (3개)

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `postgres` | PostgreSQL 15 + pgvector + PGroonga | 5432 | 메인 DB + 벡터 DB + 전문 검색 |
| `backend` | FastAPI (Python 3.12) | 8000 | 백엔드 API 서버 |
| `frontend` | Next.js 14 | 3000 | 프론트엔드 UI |

### 접속

| 서비스 | URL | 설명 |
|--------|-----|------|
| Frontend | http://localhost:3000 | 메인 UI (로그인 후 이용) |
| Backend API | http://localhost:8000 | FastAPI 서버 |
| API 문서 (Swagger) | http://localhost:8000/docs | API 테스트 인터페이스 |

### 초기 관리자 계정

서비스 최초 실행 시 `.env`에 설정한 `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`로 관리자 계정이 자동 생성됩니다.

---

## 5. 기능 상세

### 5.1 문서 관리

- **업로드 지원 포맷**: PDF, DOCX, PPTX, XLSX, XLS, EML (이메일), TXT 등
- **자동 처리 파이프라인**: 업로드 즉시 텍스트 추출 → 청킹 → BGE-m3 임베딩 → 검색 가능 상태
- **폴더 구조**: 고객사 / 문서 유형별 자동 분류
- **중복 감지**: SHA-256 해시 기반 파일 중복 체크
- **소유자 추적**: 이메일 문서의 경우 수신자(owner) 자동 매핑
- **수동 정제**: 보호(암호/DRM) 문서의 경우 수동 정제 텍스트 업로드 지원

### 5.2 하이브리드 검색

세 가지 검색 채널을 병렬 실행하고 RRF(Reciprocal Rank Fusion)로 융합합니다:

| 채널 | 모델/엔진 | 특성 |
|------|-----------|------|
| **Dense** | BAAI/bge-m3 (1024d) via pgvector | 의미적 유사도 (코사인 거리) |
| **Sparse** | pgvector sparsevec | 어휘적 유사도 |
| **Keyword** | PGroonga | 한국어 형태소 분석 기반 정확 매칭 |

- **RRF 융합**: `score = w_dense/(rank+K) + w_sparse/(rank+K) + w_keyword/(rank+K)`
- 세 채널의 결과를 순위 기반으로 합산하여 최종 랭킹 결정

### 5.3 RAG 채팅

- **스트리밍**: Server-Sent Events(SSE)로 토큰 단위 실시간 답변
- **컨텍스트 주입**: 하이브리드 검색 상위 결과를 GPT-4o-mini에 컨텍스트로 전달
- **소스 표시**: 답변 생성에 사용된 문서 출처 함께 표시
- **대화 이력**: Conversation/Message 모델로 채팅 세션 관리

### 5.4 이메일 관리

- **프로토콜**: POP3 / IMAP 모두 지원
- **계정 설정**: 사용자별 이메일 계정 등록 (비밀번호 Fernet 암호화 저장)
- **고객사 자동 분류**: `customer_domain_map.json` 기반 도메인/키워드로 자동 분류
  - 도메인 매칭: `"@samsung.com"` → 삼성전자
  - 키워드 매칭: 제목/본문에 특정 키워드 포함 시 분류
  - 기본값: `"_default"` (미분류)
- **배치 처리**: `process_emails.py` CLI로 대량 이메일 일괄 처리
- **문서 통합**: 수집된 이메일은 일반 문서와 동일하게 검색 및 RAG에 활용

### 5.5 보안 이벤트 관리

- **상태 관리**: OPEN → ACKNOWLEDGED → RESOLVED 워크플로
- **조치 기록**: 이벤트별 대응 조치 이력 (EventHandlingRecord)
- **위험도 평가**: EventAssessment를 통한 위험도 점수 기록
- **상태 이력**: 모든 상태 변경을 EventStateHistory에 기록

### 5.6 지식 그래프

- **엔티티 관계**: DocumentRelation 테이블 기반 엔티티 간 관계 저장
- **BFS 탐색**: 특정 엔티티에서 최대 3홉까지 연결 관계 탐색
- **시각화**: react-force-graph 기반 인터랙티브 그래프 렌더링

---

## 6. 업무 로직 및 플로우

### 6.1 전체 아키텍처

```
┌────────────────────────────────────────────────────────────────┐
│                   Docker Compose (3 services)                  │
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │     Frontend          │───▶│       FastAPI Backend        │  │
│  │   (Next.js 14)        │    │        (port 8000)           │  │
│  │   (port 3000)         │    └──────────────┬───────────────┘  │
│  └──────────────────────┘                   │                  │
│                                             │                  │
│                             ┌───────────────▼──────────────┐  │
│                             │        PostgreSQL 15          │  │
│                             │  + pgvector  + PGroonga       │  │
│                             │        (port 5432)            │  │
│                             └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
        ▲                                      ▲
        │                                      │
┌───────┴────────┐                   ┌─────────┴────────┐
│  POP3/IMAP     │                   │  External APIs   │
│  이메일 서버    │                   │  OpenAI API      │
│  (이메일 수집)  │                   │  HuggingFace API │
└────────────────┘                   └──────────────────┘
```

### 6.2 문서 업로드 → 임베딩 → 검색 → 답변 전체 플로우

#### Phase 1: 문서 업로드

```
사용자 (Frontend /documents)
  │
  ▼
POST /api/v1/upload
  │
  ▼
[data.py] upload_document()
  ├── 1. 파일 내용 읽기
  ├── 2. SHA-256 해시 계산 (중복 감지)
  │      hashlib.sha256(content).hexdigest()
  ├── 3. uploads/ 폴더에 원본 파일 저장
  │      → 경로: "uploads/{uuid}.{확장자}"
  ├── 4. Document 레코드 생성 (PostgreSQL)
  │      Document(
  │        title, doc_type, customer,
  │        file_path, file_name, file_size,
  │        content_hash, owner
  │      )
  └── 5. BackgroundTasks에 처리 태스크 등록
         FastAPI BackgroundTask로 비동기 실행
```

#### Phase 2: 백그라운드 문서 처리

```
[data_processor.py] process_file(document_id)
  │
  ├── 1. DB에서 Document 조회
  │
  ├── 2. 파일 타입별 텍스트 추출 (document_parser.py)
  │      ├── PDF (.pdf)
  │      │   → PyMuPDF(fitz): 페이지별 page.get_text()
  │      │
  │      ├── DOCX (.docx)
  │      │   → python-docx: 헤딩/문단별 paragraph.text 추출
  │      │
  │      ├── PPTX (.pptx)
  │      │   → python-pptx: 슬라이드별 텍스트 + 테이블 + 노트
  │      │
  │      ├── XLSX (.xlsx/.xls)
  │      │   → openpyxl: 시트별 행을 "헤더: 값 | 헤더: 값" 형태로 변환
  │      │
  │      └── EML (.eml)
  │          → email 라이브러리: RFC 822 파싱, 본문 + 첨부파일 텍스트 추출
  │
  ├── 3. 섹션 기반 적응형 청킹 (chunking.py)
  │      → 헤딩/섹션 경계 감지 후 분할
  │      → 각 청크: 약 1000자 (경계에 따라 가변)
  │
  ├── 4. BGE-m3 임베딩 생성 (embedding.py)
  │      배치 처리 (batch_size = 32)
  │      │
  │      └── HuggingFace API 호출
  │          POST https://api-inference.huggingface.co/pipeline/feature-extraction/...
  │          Body: {"inputs": ["chunk text 1", ...]}
  │          → Dense vector (1024차원) 반환
  │
  └── 5. DocumentChunk 저장 (PostgreSQL + pgvector)
         DocumentChunk(
           document_id, chunk_index,
           content,               ← 청크 텍스트
           embedding              ← Vector(1024) pgvector 컬럼
         )

처리 완료 → Document 상태 업데이트
```

#### Phase 3: 하이브리드 검색

```
POST /api/v1/search
  │  {"query": "서버 장애 대응 절차", "limit": 10}
  │
  ▼
[retrieval.py] hybrid_search()
  │
  ├── 1. 쿼리 임베딩 생성
  │      embedding.py → HuggingFace API
  │      → query_vector (1024차원)
  │
  ├── 2. 3-Way 병렬 검색
  │      │
  │      ├── [Dense Search] pgvector 코사인 거리
  │      │   SELECT id, (embedding <=> query_vector::vector) AS score
  │      │   FROM document_chunks
  │      │   ORDER BY score LIMIT 100
  │      │
  │      ├── [Sparse Search] pgvector sparsevec 거리
  │      │   SELECT id, (sparse_embedding <=> query_sparse::sparsevec) AS score
  │      │   FROM document_chunks
  │      │   ORDER BY score LIMIT 100
  │      │
  │      └── [Keyword Search] PGroonga 전문 검색
  │          SELECT id, pgroonga_score() AS score
  │          FROM document_chunks
  │          WHERE content &@~ '서버 장애 대응 절차'
  │          ORDER BY score DESC LIMIT 100
  │
  ├── 3. RRF (Reciprocal Rank Fusion) 융합
  │      final_score = Σ weight_i / (rank_i + K)
  │
  └── 4. 상위 N개 반환 (기본 limit=10)
```

#### Phase 4: RAG 채팅 (AI 답변 생성)

```
GET /api/v1/chat/completions?message={query}
  │
  ▼
[chat.py] → [retrieval.py] hybrid_search(query)
  │  → 관련 청크 상위 K개 검색
  │
  ▼
[llm.py] get_llm_stream()
  │
  ├── 검색된 청크들을 컨텍스트 텍스트로 조립
  │   "[1] 문서제목\n   내용: {청크 텍스트}"
  │
  ├── OpenAI GPT-4o-mini API 호출
  │   messages = [
  │     system: "MSP 운영 전문가. 제공된 문서 기반으로만 답변."
  │     user: "문서:\n{context}\n\n질문: {query}"
  │   ]
  │   → stream=True (SSE 스트리밍)
  │
  └── 토큰 단위로 Frontend SSE 전송
      → Frontend에서 실시간 타이핑 효과로 답변 표시
```

#### 전체 End-to-End 요약

```
[업로드]                    [처리]                        [검색/답변]

사용자가 파일 업로드         백그라운드 자동 처리             사용자가 질문 입력
     │                           │                              │
     ▼                           ▼                              ▼
uploads/ 폴더에 저장 ──────▶ 파일 타입별 텍스트 추출       쿼리 임베딩 생성 (BGE-m3)
     │                     (PDF/DOCX/PPTX/XLSX/EML)             │
     ▼                           │                              ▼
Document 레코드 생성              ▼                        3-Way 병렬 검색
     │                      섹션 기반 적응형 청킹           (Dense+Sparse+Keyword)
     ▼                           │                              │
BackgroundTask 등록               ▼                              ▼
                           BGE-m3 임베딩 생성              RRF 융합 → 최종 순위
                           (HuggingFace API)                      │
                                  │                              ▼
                                  ▼                       GPT-4o-mini 답변 생성
                           DocumentChunk 저장              (컨텍스트 + 질문)
                           (pgvector 컬럼)                        │
                                                                  ▼
                                                          SSE 스트리밍으로
                                                          실시간 답변 표시
```

### 6.3 이메일 처리 플로우

```
1. /admin 또는 /auth/mail-config에서 POP3/IMAP 계정 설정
   └─ 비밀번호는 Fernet으로 암호화하여 DB 저장
   │
   ▼
2. POST /api/v1/email/fetch 요청
   │
   ▼
[email_fetcher.py]
   ├── POP3/IMAP 서버 접속
   ├── 이메일 목록 조회
   └── 각 이메일에 대해:
       ├── .eml 파일로 uploads/ 저장
       ├── From/To/Subject/Date 메타데이터 추출
       ├── customer_domain_map.json으로 고객사 분류
       │   ├── 도메인 매핑: "@samsung.com" → 삼성전자
       │   ├── 키워드 매핑: "_keywords" 섹션에서 제목/본문 매칭
       │   └── 기본값: "_default" → "미분류"
       └── process_file() BackgroundTask 등록 → 임베딩 처리
   │
   ▼
3. 이메일도 일반 문서와 동일하게 검색/RAG에서 활용 가능
   → GET /api/v1/email/list 에서 목록 조회
   → owner 필드로 수신자별 필터링 가능
```

---

## 7. 주요 API 엔드포인트

### 인증

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/auth/login` | JWT 로그인 (access_token 발급) |
| GET | `/api/v1/auth/me` | 현재 사용자 정보 조회 |
| GET/POST | `/api/v1/auth/users` | 사용자 목록/생성 (관리자 전용) |
| DELETE | `/api/v1/auth/users/{id}` | 사용자 삭제 (관리자 전용) |
| GET/PUT/DELETE | `/api/v1/auth/mail-config` | 메일 계정 조회/수정/삭제 |
| POST | `/api/v1/auth/mail-config/test` | POP3/IMAP 연결 테스트 |

### 문서 관리

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/upload` | 문서 업로드 (자동 처리 시작) |
| GET | `/api/v1/documents` | 문서 목록 (필터/페이지네이션) |
| GET | `/api/v1/documents/customers` | 고객사 목록 |
| GET | `/api/v1/documents/{id}` | 문서 상세 |
| DELETE | `/api/v1/documents/{id}` | 문서 삭제 |
| GET | `/api/v1/documents/{id}/content` | 문서 전문 텍스트 조회 |
| POST | `/api/v1/documents/{id}/refine` | 수동 정제 문서 업로드 |

### 검색 / RAG

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/search` | 하이브리드 검색 (Dense+Sparse+Keyword) |
| GET | `/api/v1/chat/completions` | RAG 채팅 (SSE 스트리밍 답변) |

### 이메일

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/email/fetch` | POP3/IMAP에서 이메일 수집 |
| GET | `/api/v1/email/list` | 이메일 목록 |
| GET | `/api/v1/email/{id}` | 이메일 상세 |
| GET | `/api/v1/email/customers` | 이메일 고객사 목록 |
| GET | `/api/v1/email/domain-map` | 도메인 매핑 파일 조회 |

### 이벤트 / 그래프

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/v1/events` | 이벤트 목록/생성 |
| GET | `/api/v1/events/{id}` | 이벤트 상세 (상태 이력 포함) |
| GET | `/api/v1/graph/context` | 지식 그래프 컨텍스트 (BFS 탐색) |

### 헬스 체크

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 루트 (API 정보) |
| GET | `/api/v1/health` | 서비스 헬스 체크 |

---

## 8. 데이터 모델

```
User (사용자)
 ├── email, hashed_password, role (admin/user), is_active
 └── UserMailConfig (POP3/IMAP 계정)
      └── host, port, protocol, username, encrypted_password

Document (문서)
 ├── title, doc_type, customer, file_path, file_name
 ├── content_hash (SHA-256), owner (이메일)
 ├── DocumentChunk (청크 + 임베딩)
 │    └── content, chunk_index, embedding: Vector(1024)
 ├── DocumentRelation (엔티티 관계, 지식 그래프용)
 └── ManualRefinedDocument (수동 정제본)

EventOccurrence (보안 이벤트)
 ├── title, severity, status, customer
 ├── EventStateHistory (상태 변경 이력)
 ├── EventHandlingRecord (조치 기록)
 └── EventAssessment (위험도 평가)

Conversation (채팅 세션)
 └── Message (채팅 메시지)
      └── role (user/assistant), content

AuditLog (감사 로그)
 └── user_id, action, resource, timestamp

IncidentCase (인시던트 케이스)
SanitizedKnowledge (정제 지식)
```

---

## 9. 테스트 방법

### API 테스트 (curl)

```bash
# 헬스 체크
curl http://localhost:8000/api/v1/health

# 로그인 (토큰 발급)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin1234!"}'

# 문서 업로드
curl -X POST http://localhost:8000/api/v1/upload \
  -H "Authorization: Bearer {token}" \
  -F "file=@sample.pdf" \
  -F "doc_type=manual" \
  -F "customer=고객사명"

# 하이브리드 검색
curl -X POST http://localhost:8000/api/v1/search \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"query": "서버 장애 대응 절차", "limit": 10}'

# RAG 채팅 (SSE 스트리밍)
curl -N "http://localhost:8000/api/v1/chat/completions?message=서버+장애+대응+방법은?" \
  -H "Authorization: Bearer {token}"
```

### 프론트엔드 시연

1. **로그인**: http://localhost:3000/login
2. **문서 업로드**: http://localhost:3000/documents
3. **RAG 채팅**: http://localhost:3000 (홈 화면)
4. **이메일 관리**: http://localhost:3000/email
5. **검색**: http://localhost:3000/search
6. **보안 이벤트**: http://localhost:3000/events
7. **지식 그래프**: http://localhost:3000/graph
8. **사용자 관리**: http://localhost:3000/admin (관리자 전용)
