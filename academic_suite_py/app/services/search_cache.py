"""Unified search cache wrapper.

Uses ``SQLiteCache`` for development and ``RedisCache`` for production.
Cache failures are logged as warnings and never crash the request.
"""

import json
import hashlib
import logging
from typing import Any, Optional

from cache.sqlite_cache import SQLiteCache

logger = logging.getLogger("academic_suite")


class SearchCache:
    """Wrapper providing a unified cache interface for scholarly search results.

    It first attempts to retrieve from Redis (if configured) and falls back to
    SQLite.  Setting a value writes to both caches.  All operations are
    wrapped in try/except so cache failures never crash the calling request.
    """

    def __init__(self, redis_url: Optional[str] = None, sqlite_path: str = "./cache.db"):
        self._redis_cache = None
        if redis_url:
            try:
                from cache.redis_cache import RedisCache
                self._redis_cache = RedisCache(redis_url)
            except Exception as exc:
                logger.warning("Redis cache initialization failed: %s", exc)
        self._sqlite_cache = SQLiteCache(sqlite_path)
        self._stats = {"hits": 0, "misses": 0, "writes": 0}

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    @property
    def stats(self) -> dict:
        """Return cache hit/miss/write counters for the current request."""
        return dict(self._stats)

    def reset_stats(self) -> None:
        """Reset counters (call at the start of each request)."""
        self._stats = {"hits": 0, "misses": 0, "writes": 0}

    # ------------------------------------------------------------------
    # Key helpers
    # ------------------------------------------------------------------

    @staticmethod
    def make_key(prefix: str, value: str) -> str:
        """Create a deterministic cache key from a prefix and value."""
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
        return f"paggy:{prefix}:{digest}"

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve a value.  Redis first, SQLite fallback."""
        # Try Redis
        if self._redis_cache:
            try:
                val = await self._redis_cache.get(key)
                if val is not None:
                    self._stats["hits"] += 1
                    return val
            except Exception as exc:
                logger.warning("Redis GET failed for key %s: %s", key, exc)

        # SQLite fallback
        try:
            val = await self._sqlite_cache.get(key)
            if val is not None:
                self._stats["hits"] += 1
                return val
        except Exception as exc:
            logger.warning("SQLite cache GET failed for key %s: %s", key, exc)

        self._stats["misses"] += 1
        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Write to both caches (failures are logged, not raised)."""
        if self._redis_cache:
            try:
                await self._redis_cache.set(key, value, ttl)
            except Exception as exc:
                logger.warning("Redis SET failed for key %s: %s", key, exc)

        try:
            await self._sqlite_cache.set(key, value, ttl)
            self._stats["writes"] += 1
        except Exception as exc:
            logger.warning("SQLite cache SET failed for key %s: %s", key, exc)
