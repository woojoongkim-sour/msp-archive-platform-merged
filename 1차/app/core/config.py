import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@postgres/msp_archive")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3")
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://gotenberg:3000")

# For pgvector extension
# You might need to install this extension in your PostgreSQL database.
# CREATE EXTENSION IF NOT EXISTS vector;
