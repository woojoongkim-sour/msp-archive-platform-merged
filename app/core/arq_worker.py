# app/core/arq_worker.py
from arq.connections import RedisSettings
from app.core.config import REDIS_URL
from app.services.data_processor import process_file

async def startup(ctx):
    print("ARQ worker started")

async def shutdown(ctx):
    print("ARQ worker shutdown")

# Important: The function must be in this list to be recognized by the worker.
functions = [process_file]

class WorkerSettings:
    functions = functions
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings(
        host=REDIS_URL.split('//')[1].split(':')[0],
        port=int(REDIS_URL.split(':')[2].split('/')[0])
    )
