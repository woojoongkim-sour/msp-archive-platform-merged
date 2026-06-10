# MSP Archive Platform (Merged) — 전체 워크플로우

> 목적: 문서 업로드부터 AI 답변 생성까지 전체 파이프라인을 코드 레벨로 추적

---

## 전체 흐름 요약

```
[Phase 1] 업로드          [Phase 2] 처리               [Phase 3] 검색 & 답변

사용자가 파일 업로드      백그라운드 자동 처리           사용자가 질문 입력
     │                        │                            │
     ▼                        ▼                            ▼
 uploads/ 폴더에 저장     텍스트 추출                  쿼리 임베딩 생성
     │                  (PDF/DOCX/XLSX/PPTX/EML)        (BGE-m3)
     ▼                        │                            │
 Document 레코드 생성         ▼                            ▼
     │                  섹션 기반 적응형 청킹          3-Way 병렬 검색
     ▼                        │                   (Dense+Sparse+Keyword)
 BackgroundTask 등록          ▼                            │
                        BGE-m3 임베딩 생성                 ▼
                        (HuggingFace API)            RRF 융합 + 랭킹
                              │                            │
                              ▼                            ▼
                        DocumentChunk 저장          GPT-4o-mini 답변 생성
                        (pgvector 컬럼)             (검색 컨텍스트 + 질문)
                                                           │
                                                           ▼
                                                    SSE 스트리밍으로
                                                    실시간 답변 표시
```

---

## Phase 1: 문서 업로드

### 진입점

- **프론트엔드**: `frontend/app/documents/page.tsx` → 업로드 영역
- **API 클라이언트**: `frontend/lib/apiFetch.ts` → JWT Bearer 토큰 자동 첨부
- **백엔드 API**: `POST /api/v1/upload` → `app/api/v1/data.py:upload_document()`

### 상세 흐름

```
사용자가 프론트엔드에서 파일 선택 + 메타데이터 입력 + 업로드 클릭
     │
     ▼
[frontend/app/documents/page.tsx]
  → FormData 구성: file, doc_type, customer, ...
  → POST /api/v1/upload (multipart/form-data)
     │
     ▼
[app/api/v1/data.py] upload_document()
  │
  ├── 1. 파일 내용 읽기
  │      content = await file.read()  → bytes
  │
  ├── 2. SHA-256 해시 계산 (중복 감지용)
  │      hashlib.sha256(content).hexdigest()
  │      → 동일 해시 존재 시 중복 문서 처리
  │
  ├── 3. uploads/ 폴더에 원본 파일 저장
  │      → 경로: "uploads/{uuid8자리}.{확장자}"
  │      → 로컬 파일시스템 저장 (MinIO 미사용)
  │
  ├── 4. Document 레코드 생성 (PostgreSQL)
  │      Document(
  │        title, doc_type, customer,
  │        file_path, file_name, file_size,
  │        content_hash,        ← SHA-256 해시
  │        owner,               ← 이메일 문서의 경우 수신자
  │        tags                 ← JSON 형태 추가 메타데이터
  │      )
  │      → db.add() → db.commit()
  │
  └── 5. 백그라운드 처리 태스크 등록
         BackgroundTasks.add_task(process_file, document.id, db)
         → FastAPI BackgroundTask로 비동기 실행 (응답 반환 후 처리)
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `app/api/v1/data.py` | 업로드 API 엔드포인트, 폴더/문서 관리 |
| `app/models/document.py` | Document ORM 모델 (파일 메타데이터, 처리 상태) |
| `app/services/data_processor.py` | 업로드 후 처리 파이프라인 진입점 |

---

## Phase 2: 백그라운드 문서 처리

### 진입점

- `app/api/v1/data.py` → `BackgroundTasks.add_task(process_file, document_id)`
- `app/services/data_processor.py:process_file()`

### 상세 흐름

```
[data_processor.py] process_file(document_id, db)
  │
  ├── 1. DB에서 Document 조회
  │
  ├── 2. 파일 타입 / 확장자 판별
  │
  ├── 3. 파일 타입별 텍스트 추출 (document_parser.py)
  │      │
  │      ├── PDF (.pdf)
  │      │   _extract_pdf() → PyMuPDF(fitz)
  │      │   for page in doc:
  │      │       text = page.get_text("text")
  │      │   → "\n\n".join(pages)
  │      │
  │      ├── DOCX (.docx)
  │      │   _extract_docx() → python-docx
  │      │   → 헤딩(Heading 1/2/3) 감지 → 섹션 분리
  │      │   → paragraph.text 추출
  │      │
  │      ├── PPTX (.pptx)
  │      │   _extract_pptx() → python-pptx
  │      │   → 슬라이드별 텍스트 + 테이블 + 발표자 노트
  │      │
  │      ├── XLSX (.xlsx) / XLS (.xls)
  │      │   _extract_xlsx() → openpyxl / xlrd
  │      │   → 시트별 분리
  │      │   → 헤더 행 자동 감지
  │      │   → "헤더: 값 | 헤더: 값" 형태 변환
  │      │   예: "서버명: WEB-PRD-01 | IP: 10.1.1.10 | OS: RHEL 8.6"
  │      │
  │      └── EML (.eml) — 이메일 파일
  │          → email 라이브러리 (RFC 822 파싱)
  │          → From/To/Subject/Date 헤더 추출
  │          → 본문 (text/plain 또는 text/html → 텍스트 변환)
  │          → 첨부파일 텍스트 추출 (지원 포맷)
  │
  │      텍스트 추출 실패 시:
  │      → ManualRefinedDocument 존재 여부 확인
  │      → 없으면 처리 실패 상태로 종료
  │
  ├── 4. 섹션 기반 적응형 청킹 (chunking.py)
  │      │
  │      ├── 헤딩/섹션 경계 감지 (##, 1., ○ 등)
  │      │
  │      └── 섹션 단위로 분할 후 크기 조정:
  │          → 섹션이 너무 크면 → 추가 분할
  │          → 섹션이 너무 작으면 → 인접 섹션과 병합
  │          → 목표 크기: ~1000자
  │
  │          예시 (3000자 텍스트):
  │          Chunk 0: "## 1장 서론\n내용..."          (헤딩 포함)
  │          Chunk 1: "## 2장 설치 방법\n내용..."
  │          Chunk 2: "## 3장 운영 방법\n내용..."
  │
  ├── 5. BGE-m3 임베딩 생성 (embedding.py)
  │      배치 처리 (batch_size = 32)
  │      │
  │      └── HuggingFace Inference API 호출
  │          POST https://api-inference.huggingface.co/pipeline/
  │               feature-extraction/BAAI/bge-m3
  │          Headers: Authorization: Bearer {HF_TOKEN}
  │          Body: {"inputs": ["chunk text 1", "chunk text 2", ...]}
  │          → 응답: [[0.012, -0.034, ..., 0.041], ...]  (각 1024차원)
  │
  └── 6. DocumentChunk 저장 (PostgreSQL + pgvector)
         DocumentChunk(
           document_id,
           chunk_index,       ← 청크 순서 번호 (0부터)
           content,           ← 청크 텍스트 원문
           embedding          ← Vector(1024) pgvector 컬럼
         )
         → db.add_all(chunks) → db.commit()

처리 완료:
  → Document 상태 업데이트 (완료 표시)
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `app/services/data_processor.py` | 전체 처리 파이프라인 오케스트레이터 |
| `app/services/document_parser.py` | 파일 타입별 텍스트 추출 |
| `app/services/chunking.py` | 섹션 기반 적응형 청킹 |
| `app/core/embedding.py` | BGE-m3 임베딩 (HuggingFace API, 배치 처리) |
| `app/models/document_chunk.py` | DocumentChunk ORM (embedding: Vector(1024)) |

---

## Phase 3: 검색 & AI 답변 생성

### 3-1. 하이브리드 검색

#### 진입점

- **프론트엔드**: `frontend/app/search/page.tsx` → 검색 입력
- **API**: `POST /api/v1/search` → `app/api/v1/search.py`
- **서비스**: `app/services/retrieval.py:hybrid_search()`

#### 상세 흐름

```
[retrieval.py] hybrid_search(query, limit, filters)
  │
  ├── 1. 쿼리 임베딩 생성
  │      embedding.py → HuggingFace Inference API
  │      → query_vector (1024차원 Dense)
  │
  ├── 2. 3-Way 병렬 검색 실행
  │      │
  │      ├── [Dense Search] pgvector 코사인 거리
  │      │   SELECT dc.id, dc.content, d.title,
  │      │          (dc.embedding <=> %s::vector) AS distance
  │      │   FROM document_chunks dc
  │      │   JOIN documents d ON dc.document_id = d.id
  │      │   ORDER BY distance ASC
  │      │   LIMIT 100
  │      │   → score = 1 - cosine_distance (0~1, 높을수록 유사)
  │      │
  │      ├── [Sparse Search] pgvector sparsevec 거리
  │      │   SELECT dc.id,
  │      │          (dc.sparse_embedding <=> %s::sparsevec) AS distance
  │      │   FROM document_chunks dc
  │      │   ORDER BY distance ASC
  │      │   LIMIT 100
  │      │
  │      └── [Keyword Search] PGroonga 전문 검색
  │          SELECT dc.id, pgroonga_score(tableoid, ctid) AS score
  │          FROM document_chunks dc
  │          WHERE dc.content &@~ %s
  │          ORDER BY score DESC
  │          LIMIT 100
  │
  ├── 3. RRF (Reciprocal Rank Fusion) 융합
  │      _rrf_merge(dense_results, sparse_results, keyword_results)
  │      │
  │      ├── 각 채널에서 chunk의 순위(rank) 추출
  │      └── 가중 RRF 계산:
  │          final_score = Σ weight_i / (rank_i + K)
  │          → K=60 (표준 RRF 상수)
  │
  └── 4. 상위 N개 반환 (limit 파라미터, 기본 10)
         → [{"chunk_id", "document_id", "document_title",
              "content", "score"}, ...]
```

### 3-2. RAG 채팅 (AI 답변 생성)

#### 진입점

- **프론트엔드**: `frontend/app/page.tsx` (홈) → 채팅 입력창
- **API**: `GET /api/v1/chat/completions?message={query}` → `app/api/v1/chat.py`
- **서비스**: `app/services/llm.py:get_llm_stream()`

#### 상세 흐름

```
[chat.py] chat_completions(message, current_user)
  │
  ├── 1. 대화 세션 관리
  │      Conversation 조회 또는 신규 생성
  │      Message(role="user", content=message) 저장
  │
  ├── 2. hybrid_search(message) 실행
  │      → 관련 청크 상위 K개 검색 (위 3-1 전체)
  │
  ├── 3. [llm.py] get_llm_stream() 호출
  │      │
  │      ├── 검색 결과 → 컨텍스트 텍스트 조립
  │      │   context = ""
  │      │   for i, chunk in enumerate(search_results):
  │      │       context += f"[{i+1}] {chunk['document_title']}\n"
  │      │       context += f"    {chunk['content']}\n\n"
  │      │
  │      ├── OpenAI GPT-4o-mini API 호출 (스트리밍)
  │      │   messages = [
  │      │     {"role": "system",
  │      │      "content": "MSP 운영 전문가. 제공된 문서 기반으로만 답변.
  │      │                  답변 시 근거 문서 번호를 인용하세요."},
  │      │     {"role": "user",
  │      │      "content": f"참고 문서:\n{context}\n\n질문: {message}"}
  │      │   ]
  │      │   client.chat.completions.create(
  │      │     model="gpt-4o-mini",
  │      │     messages=messages,
  │      │     stream=True
  │      │   )
  │      │
  │      └── 토큰 스트리밍
  │          for chunk in stream:
  │              token = chunk.choices[0].delta.content
  │              yield f"data: {token}\n\n"  ← SSE 형식
  │
  └── 4. 응답 완료 시 Message(role="assistant", content=...) 저장

Frontend (app/page.tsx):
  EventSource 또는 fetch stream으로 SSE 수신
  → 토큰 단위로 채팅 버블에 실시간 추가 (타이핑 효과)
  → 완료 시 소스 문서 목록 표시 (SyncedSourcesTable)
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `app/api/v1/chat.py` | 채팅 API, 세션 관리 |
| `app/api/v1/search.py` | 검색 API |
| `app/services/retrieval.py` | 하이브리드 검색 + RRF 융합 |
| `app/services/llm.py` | OpenAI GPT-4o-mini 스트리밍 |
| `app/core/embedding.py` | BGE-m3 쿼리 임베딩 생성 |
| `frontend/app/page.tsx` | 채팅 UI, SSE 수신 |
| `frontend/components/SyncedSourcesTable.tsx` | 소스 문서 목록 표시 |

---

## 이메일 처리 플로우

### 진입점

- **프론트엔드**: `frontend/app/email/page.tsx`
- **API**: `POST /api/v1/email/fetch` → `app/api/v1/email.py`
- **서비스**: `app/services/email_fetcher.py`
- **CLI**: `process_emails.py` (배치 처리용)

### 상세 흐름

```
1. 이메일 계정 설정
   │  POST /api/v1/auth/mail-config
   │  {host, port, protocol: "POP3"|"IMAP", username, password}
   │  → password는 Fernet으로 암호화 후 UserMailConfig 저장
   │
   ▼
2. 이메일 수집 요청
   │  POST /api/v1/email/fetch
   │  → 현재 로그인 사용자의 메일 설정 조회
   │
   ▼
[email_fetcher.py] fetch_emails(mail_config)
   │
   ├── POP3: poplib.POP3_SSL(host, port)
   │   또는 IMAP: imaplib.IMAP4_SSL(host, port)
   │   → 인증 후 INBOX 선택
   │
   └── 각 이메일에 대해:
       │
       ├── 1. 이메일 원문(bytes) 가져오기
       │
       ├── 2. RFC 822 파싱
       │       email.message_from_bytes()
       │       → From, To, Subject, Date 추출
       │       → 본문 추출 (text/plain 우선, fallback: text/html)
       │       → 첨부파일 목록 추출
       │
       ├── 3. .eml 파일로 uploads/ 저장
       │       → 경로: "uploads/email_{uuid}.eml"
       │
       ├── 4. 고객사 분류 (customer_domain_map.json)
       │       domain = To 주소에서 @뒤 도메인 추출
       │       │
       │       ├── 도메인 직접 매핑: {"samsung.com": "삼성전자"}
       │       ├── 키워드 매핑: "_keywords": {"삼성전자": "삼성전자"}
       │       │   → Subject/본문에 키워드 포함 시 매핑
       │       └── 기본값: "_default" → "미분류"
       │
       ├── 5. Document 레코드 생성
       │       Document(
       │         title = Subject,
       │         doc_type = "email",
       │         customer = 분류된 고객사,
       │         owner = To 이메일 주소,
       │         tags = {"email_from": from, "email_to": to, "date": date}
       │       )
       │
       └── 6. BackgroundTask 등록
               → process_file(document_id) → 임베딩 처리
               → 이메일도 일반 문서처럼 검색/RAG에 활용 가능
```

### customer_domain_map.json 구조

```json
{
  "samsung.com": "삼성전자",
  "sk.com": "SK하이닉스",
  "itcen.com": "내부",
  "_keywords": {
    "삼성전자": "삼성전자",
    "SK하이닉스": "SK하이닉스"
  },
  "_default": "미분류"
}
```

---

## 인증 & 사용자 관리 플로우

### 로그인

```
POST /api/v1/auth/login
  {email, password}
  │
  ▼
[auth.py] login()
  ├── 1. email로 User 조회
  ├── 2. bcrypt.verify(password, user.hashed_password)
  ├── 3. JWT 토큰 생성
  │      payload = {sub: email, exp: now + 8h}
  │      token = jose.jwt.encode(payload, SECRET_KEY, HS256)
  └── 4. {access_token, token_type: "bearer"} 반환

Frontend:
  → 토큰을 cookie에 저장
  → 이후 모든 API 요청 헤더에 Authorization: Bearer {token} 첨부
  → apiFetch.ts가 자동으로 토큰 주입
```

### 초기 Admin 계정 자동 생성

```
[main.py] on_startup()
  │
  └── _ensure_admin_user()
       ├── User 테이블이 비어있는지 확인
       └── 비어있으면 관리자 계정 자동 생성:
           User(
             email = FIRST_ADMIN_EMAIL (env),
             hashed_password = bcrypt(FIRST_ADMIN_PASSWORD),
             role = "admin"
           )
```

---

## 인프라 구성

### Docker Compose 서비스 (3개)

```
┌────────────────────────────────────────────────────────────────┐
│                   Docker Compose (3 services)                  │
│                                                                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │      Frontend         │───▶│       FastAPI Backend        │  │
│  │    (Next.js 14)       │    │        (port 8000)           │  │
│  │    (port 3000)        │    └──────────────┬───────────────┘  │
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
┌───────┴────────┐                   ┌─────────┴──────────┐
│  POP3/IMAP     │                   │   External APIs    │
│  이메일 서버    │                   │  - OpenAI API      │
│                │                   │  - HuggingFace API │
└────────────────┘                   └────────────────────┘
```

| 서비스 | 역할 | 워크플로우에서의 위치 |
|--------|------|----------------------|
| **Frontend** (Next.js 14) | UI 서빙, API 호출 | Phase 1: 업로드 폼, Phase 3: 채팅/검색 UI |
| **Backend** (FastAPI) | 비즈니스 로직 전체 | Phase 1~3 전체 오케스트레이터 |
| **PostgreSQL** (+ pgvector + PGroonga) | 데이터 저장 + 벡터 검색 + 전문 검색 | Phase 2: 청크/벡터 저장, Phase 3: 검색 |

### 시작 훅 (app/main.py on_startup)

FastAPI 서버 시작 시 자동 실행:

```
1. PostgreSQL 확장 활성화
   CREATE EXTENSION IF NOT EXISTS vector;     ← pgvector
   CREATE EXTENSION IF NOT EXISTS pgroonga;   ← 한국어 전문 검색

2. ORM 테이블 전체 생성
   Base.metadata.create_all(bind=engine)

3. documents 테이블 owner 컬럼 추가 (없는 경우)
   ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner VARCHAR(320)

4. 기존 이메일 문서 owner 마이그레이션
   tags->>'email_to' 에서 이메일 주소 추출 → owner 컬럼에 설정

5. owner 인덱스 생성
   CREATE INDEX IF NOT EXISTS ix_documents_owner ON documents (owner)

6. 초기 관리자 계정 생성 (User 테이블이 비어있을 경우)
```

---

## 데이터 흐름 요약

### Phase 1 → Phase 2 연결

```
documents 테이블 (processing 상태)
    → BackgroundTask: process_file(document_id)
    → uploads/ 에서 파일 읽기
    → 텍스트 추출 (파일 타입별)
    → 섹션 기반 적응형 청킹
    → BGE-m3 임베딩 생성 (HuggingFace API)
    → document_chunks 테이블에 저장 (embedding: Vector(1024))
    → documents 테이블 상태 업데이트 (완료)
```

### Phase 3 데이터 흐름

```
사용자 질문 ("서버 장애 대응 절차는?")
    → BGE-m3로 쿼리 벡터 생성 (HuggingFace API)
    → PostgreSQL에서 3-Way 검색:
       ├── pgvector Dense 검색 (코사인 유사도)
       ├── pgvector Sparse 검색 (어휘 유사도)
       └── PGroonga Keyword 검색 (한국어 형태소)
    → RRF 융합으로 최종 순위 결정
    → 상위 K개 청크 텍스트를 GPT-4o-mini에 전달
    → GPT-4o-mini가 SSE 스트리밍으로 한국어 답변 생성
    → Frontend에서 실시간 타이핑 효과로 표시
```

---

## 주요 설정값

| 설정 | 위치 | 의미 |
|------|------|------|
| `OPENAI_API_KEY` | `.env` | OpenAI API 키 (GPT-4o-mini 사용) |
| `HF_TOKEN` | `.env` | HuggingFace API 토큰 (BGE-m3 임베딩) |
| `SECRET_KEY` | `.env` | JWT 서명 시크릿 키 |
| `DATABASE_URL` | `.env` | PostgreSQL 접속 URL |
| `FIRST_ADMIN_EMAIL` | `.env` | 초기 관리자 이메일 |
| `FIRST_ADMIN_PASSWORD` | `.env` | 초기 관리자 비밀번호 |
| JWT 만료 시간 | `core/security.py` | 8시간 (ACCESS_TOKEN_EXPIRE_MINUTES=480) |
| 임베딩 차원 | `models/document_chunk.py` | 1024차원 (BAAI/bge-m3) |

---

## API 엔드포인트 매핑

| 워크플로우 단계 | HTTP Method | 경로 | 파일 |
|----------------|-------------|------|------|
| 문서 업로드 | POST | `/api/v1/upload` | `app/api/v1/data.py` |
| 문서 목록 | GET | `/api/v1/documents` | `app/api/v1/data.py` |
| 문서 삭제 | DELETE | `/api/v1/documents/{id}` | `app/api/v1/data.py` |
| 하이브리드 검색 | POST | `/api/v1/search` | `app/api/v1/search.py` |
| RAG 채팅 | GET | `/api/v1/chat/completions` | `app/api/v1/chat.py` |
| 이메일 수집 | POST | `/api/v1/email/fetch` | `app/api/v1/email.py` |
| 이메일 목록 | GET | `/api/v1/email/list` | `app/api/v1/email.py` |
| 이벤트 목록 | GET | `/api/v1/events` | `app/api/v1/events.py` |
| 지식 그래프 | GET | `/api/v1/graph/context` | `app/api/v1/graph.py` |
| 로그인 | POST | `/api/v1/auth/login` | `app/api/v1/auth.py` |
| 사용자 관리 | GET/POST/DELETE | `/api/v1/auth/users` | `app/api/v1/auth.py` |
| 헬스 체크 | GET | `/api/v1/health` | `app/main.py` |

---

## 쉽게 설명한 버전

### 이 시스템이 하는 일

MSP 운영팀이 쌓아온 문서(매뉴얼, 이메일, 운영 보고서 등)를 올리면, 나중에 자연어로 질문만 해도 관련 정보를 찾아주는 시스템입니다.

### 비유: 스마트 도서관

```
일반 도서관                          이 시스템
─────────                           ─────────
책을 가져다줌 (사서)                  문서를 업로드 (사용자)
책에 분류 번호 붙임 (정리)            문서를 잘라서 숫자로 변환 (처리)
"장애 대응 방법 찾아줘" (검색)        "서버 장애 대응 절차는?" (질문)
사서가 관련 책 몇 권 골라줌 (결과)     시스템이 관련 조각 골라줌 (검색)
직접 읽고 답을 정리 (사람)             AI가 읽고 답변 작성 (생성)
```

### 3단계로 동작합니다

#### 1단계: 올리기 (업로드)

```
사용자가 파일을 올린다
    → 파일을 uploads/ 폴더에 저장한다
    → "이 문서가 들어왔다"고 DB에 기록한다
    → 백그라운드에서 자동 처리를 시작한다
```

#### 2단계: 정리하기 (처리)

```
파일에서 글자를 꺼낸다 (PDF면 PDF 읽기, 엑셀이면 엑셀 읽기, 이메일이면 이메일 파싱)
    → 섹션 단위로 잘라서 조각낸다 (청킹)
    → 각 조각의 "의미"를 1024개 숫자로 변환한다 (BGE-m3 임베딩)
    → 숫자로 변환된 조각들을 DB에 저장한다 (pgvector)
```

왜 숫자로 변환하냐면, 컴퓨터는 "DB 장애"와 "데이터베이스 오류"가 같은 뜻인지 글자만 봐서는 모릅니다.
BGE-m3가 의미를 숫자로 바꾸면, 비슷한 의미끼리 비슷한 숫자가 되어 의미 기반 검색이 가능해집니다.

#### 3단계: 찾아서 답하기 (검색 + AI 답변)

```
사용자가 질문한다: "서버 장애 대응 절차는?"
    → 질문도 숫자로 변환한다
    → DB에 저장된 조각들 중 숫자가 비슷한 것을 찾는다 (3가지 방법으로 동시 검색)
       ├── 의미로 찾기: 뜻이 비슷한 조각 (Dense Search)
       ├── 단어로 찾기: 같은 단어가 포함된 조각 (Keyword/Sparse Search)
       └── 융합: 위 결과를 합쳐서 가장 관련 있는 순서로 정렬 (RRF)
    → 상위 K개 조각을 AI(GPT-4o-mini)에게 보여주면서 "이걸 보고 답해줘"라고 시킨다
    → AI가 조각들을 읽고 한국어로 답변을 스트리밍으로 만든다
```

### 각 서비스의 역할

| 서비스 | 비유 | 하는 일 |
|--------|------|---------|
| **FastAPI** | 지휘자 | 전체 흐름 관리. 직접 할 수 있는 건 직접 하고(텍스트 추출, 청킹), 전문 분야는 외부 서비스에 요청 |
| **PostgreSQL** | 도서관 서가 | 텍스트와 벡터를 저장하고, "이 숫자와 비슷한 데이터 찾아줘"를 처리 (pgvector + PGroonga) |
| **BGE-m3** | 번역기 | 한국어 텍스트를 숫자 1024개로 변환 (HuggingFace API 호출) |
| **GPT-4o-mini** | 답변 작성자 | 검색으로 찾은 텍스트 조각들을 읽고 한국어 답변을 스트리밍으로 생성 |
| **Next.js** | 화면 | 사용자가 파일을 올리고, 질문하고, 답변을 받는 인터페이스 |

FastAPI가 직접 하는 일과 외부 서비스에 맡기는 일:

| 작업 | 직접? | 담당 |
|------|-------|------|
| 사용자 요청 받기 (API) | ✅ 직접 | — |
| 파일 저장 | ✅ 직접 | 로컬 uploads/ 폴더 |
| 텍스트 추출 (PDF/엑셀 읽기) | ✅ 직접 | Python 라이브러리 |
| 청킹 (섹션 단위 분할) | ✅ 직접 | Python 코드 |
| 임베딩 (텍스트→숫자) | ❌ 외부 | HuggingFace API (BGE-m3) |
| 벡터 저장 & 검색 | ❌ 외부 | PostgreSQL (pgvector) |
| AI 답변 생성 | ❌ 외부 | OpenAI API (GPT-4o-mini) |
