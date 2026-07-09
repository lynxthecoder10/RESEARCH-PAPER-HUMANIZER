import redis.asyncio as redis
import json
from typing import Any, Optional
from cache.base import CacheBase
import logging
import time

logger = logging.getLogger("academic_suite")

class RedisCache(CacheBase):
    def __init__(self, url: str = "redis://localhost:6379/0"):
        self.client = redis.from_url(url)

    async def get(self, key: str) -> Optional[Any]:
        raw = await self.client.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to decode cache value for %s", key, exc_info=e)
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        raw = json.dumps(value)
        if ttl:
            await self.client.set(key, raw, ex=ttl)
        else:
            await self.client.set(key, raw)
