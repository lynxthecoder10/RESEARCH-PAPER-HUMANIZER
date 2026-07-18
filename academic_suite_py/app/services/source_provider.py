from abc import ABC, abstractmethod
from typing import List, Dict


class SourceProvider(ABC):
    """Abstract base class for source providers.

    Implementations must provide a ``search`` method that accepts a list of
    keywords and returns a list of source dictionaries.
    """

    @abstractmethod
    def search(self, keywords: List[str]) -> List[Dict]:
        """Search for scholarly sources matching the supplied keywords.

        Returns a list of source records (dicts) with the required fields.
        """
        raise NotImplementedError
