import abc
from typing import Any, Optional

class CacheBase(abc.ABC):
    """Abstract cache interface.

    Implementations must provide ``get`` and ``set`` methods.
    ``set`` may accept an optional ``ttl`` in seconds.
    """

    @abc.abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Retrieve a value from the cache.

        Returns ``None`` if the key does not exist.
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set a value in the cache.

        ``ttl`` – time‑to‑live in seconds. If ``None`` the key persists
        according to the backend policy.
        """
        raise NotImplementedError
