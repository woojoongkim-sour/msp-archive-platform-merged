# MSP Archive Platform — 병합 저장소

## 프로젝트 개요

MSP 운영팀을 위한 문서 아카이브 + RAG 채팅 플랫폼.
팀원들이 개발한 기능을 단계적으로 병합한 저장소.

## 폴더 구조

```
/root/AI/merged/          ← 이 디렉토리 (git 루트)
├── 1차/                  ← 1차 병합: JWT 인증, 이메일, 보안 이벤트, 지식 그래프
├── 2차/                  ← 2차 병합: Adaptive RAG, 고객사 CRUD, Alert 웹훅, ARQ 워커
└── CLAUDE.md

/root/AI/merged_v2_work/  ← 2차 병합 작업용 원본 (git 없음)
```

## GitHub

- **레포**: `https://github.com/woojoongkim-sour/msp-archive-platform-merged.git`
- **브랜치**: `main`
- **remote**: 토큰 인증 포함 (로컬 git config에 설정됨 — 토큰은 버전 관리 제외)
- **보조 레포**: `songsi22/AIOps` → `MSP Archive Platform/2차/` 경로 (미완료)

## 기술 스택

- **Backend**: FastAPI (Python 3.12), sync SQLAlchemy
- **DB**: PostgreSQL 15 + pgvector + PGroonga
- **LLM**: OpenAI GPT-4o-mini (Bedrock 없음)
- **임베딩**: HuggingFace API, BAAI/bge-m3 (Dense 1024차원, sparse 없음)
- **Frontend**: Next.js 14 (TypeScript, Tailwind CSS)
- **2차 추가**: Redis + ARQ 비동기 워커

## 1차 주요 기능

JWT 인증, 이메일 수집(POP3/IMAP), 보안 이벤트 관리, 지식 그래프, 하이브리드 검색(Dense+Sparse+Keyword RRF)

## 2차 주요 기능 (팀원 코드 병합)

- **Adaptive RAG**: Simple/Complex 자동 라우팅, `ESCALATION_SCORE_THRESHOLD=0.3`
- **LLM 응답 양식**: 5섹션 고정 (🚨비상연락망 🔑서버접속 📋작업이력 🛠️조치가이드 📨메일)
- **고객사 CRUD**: `Customer(int PK, String code)` + `CustomerAlias`
- **Alert Webhook**: Zabbix/Grafana → `POST /alerts/guide` → 조치가이드
- **HWP 파서**: pyhwp + hwp5txt CLI
- **ARQ 워커**: Redis 기반 비동기 문서 처리
- **SSE 진행 상황**: Redis pub/sub → DB 폴링 fallback
- **Zammad 수집기**: `scripts/zammad_collector.py`

## 절대 커밋 금지

- `.env`
- `frontend/.env.production` (서버 IP 포함)
- `.claude/settings.local.json`
- `*:Zone.Identifier` / `*.Zone.Identifier` (Windows 메타데이터)

## 다음 할 일

- `songsi22/AIOps` 레포에 `MSP Archive Platform/2차/` 경로로 push (대기 중)
