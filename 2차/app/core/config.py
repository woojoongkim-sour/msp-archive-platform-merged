import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@postgres/msp_archive")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://gotenberg:3000")

# Adaptive RAG 설정
ESCALATION_SCORE_THRESHOLD = float(os.getenv("ESCALATION_SCORE_THRESHOLD", "0.3"))

# Zammad 연동
ZAMMAD_API_URL = os.getenv("ZAMMAD_API_URL", "")
ZAMMAD_API_TOKEN = os.getenv("ZAMMAD_API_TOKEN", "")
