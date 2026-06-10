from __future__ import annotations

import httpx
from app.core.config import GOTENBERG_URL
from typing import Optional

class GotenbergClient:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
        self.base_url = GOTENBERG_URL.rstrip("/")

    async def convert(self, file_bytes: bytes, filename: str) -> bytes:
        # Convert legacy formats (doc, ppt) to modern equivalents using Gotenberg
        url = f"{self.base_url}/forms/libreoffice/convert"
        files = {"files": (filename, file_bytes)}
        try:
            resp = await self.client.post(url, files=files)
            if resp.status_code == 200:
                return resp.content
            else:
                raise RuntimeError(f"Gotenberg conversion failed: {resp.status_code} {resp.text}")
        except Exception as e:
            raise
