import aiosqlite
import json
from typing import Any, Optional
from cache.base import CacheBase
import logging

logger = logging.getLogger("academic_suite")

class SQLiteCache(CacheBase):
    def __init__(self, db_path: str = "./cache.db"):
        self.db_path = db_path

    async def _initialize(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at INTEGER
                );
                """
            )
            await db.commit()

    async def get(self, key: str) -> Optional[Any]:
        await self._initialize()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            value_json, expires_at = row
            if expires_at is not None and expires_at < int(__import__('time').time()):
                # expired, delete
                await db.execute("DELETE FROM cache WHERE key = ?", (key,))
                await db.commit()
                return None
            return json.loads(value_json)

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        await self._initialize()
        expires_at = None
        if ttl is not None:
            expires_at = int(__import__('time').time()) + ttl
        value_json = json.dumps(value)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, value_json, expires_at),
            )
            await db.commit()
