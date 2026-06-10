import logging
from arq.connections import RedisSettings
from app.core.config import REDIS_URL
from app.services.data_processor import process_file
from app.worker.tasks import process_document

logger = logging.getLogger(__name__)


async def startup(ctx):
    logger.info("ARQ worker started")


async def shutdown(ctx):
    logger.info("ARQ worker shutdown")


def _parse_redis_settings(url: str) -> RedisSettings:
    """redis://host:port/db → RedisSettings"""
    try:
        # redis://redis:6379/0
        parts = url.replace("redis://", "").split(":")
        host = parts[0]
        port_db = parts[1].split("/")
        port = int(port_db[0])
        db = int(port_db[1]) if len(port_db) > 1 else 0
        return RedisSettings(host=host, port=port, database=db)
    except Exception:
        return RedisSettings()


class WorkerSettings:
    functions = [process_file, process_document]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _parse_redis_settings(REDIS_URL)
