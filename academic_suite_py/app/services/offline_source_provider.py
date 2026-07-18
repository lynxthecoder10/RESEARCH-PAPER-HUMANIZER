"""Offline scholarly source provider using TF-IDF cosine similarity.

Loads synthetic demo records from the configured corpus file and ranks them
against extracted keywords using scikit-learn's TfidfVectorizer.
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.services.source_provider import SourceProvider

logger = logging.getLogger("academic_suite")


class OfflineSourceProvider(SourceProvider):
    """Retrieves and ranks sources from a local synthetic corpus."""

    def __init__(self, corpus_path: Optional[str] = None):
        """Initialise with a corpus path.

        If *corpus_path* is ``None``, the default from ``settings`` is used.
        """
        if corpus_path is None:
            from app.config import settings
            corpus_path = settings.OFFLINE_SOURCE_PATH

        self._corpus_path = Path(corpus_path)
        self._records: Optional[List[Dict]] = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_corpus(self) -> List[Dict]:
        """Load and cache the JSON corpus, raising a clear error if missing."""
        if self._records is not None:
            return self._records

        if not self._corpus_path.exists():
            raise FileNotFoundError(
                f"Offline corpus not found at configured path. "
                f"Ensure OFFLINE_SOURCE_PATH is set correctly."
            )

        try:
            raw = self._corpus_path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Offline corpus contains invalid JSON: {exc}"
            ) from exc

        # Validate minimal required fields and skip malformed records
        valid: List[Dict] = []
        for idx, record in enumerate(data):
            if not isinstance(record, dict):
                logger.warning("Skipping non-dict record at index %d", idx)
                continue
            if not record.get("title"):
                logger.warning("Skipping record at index %d: missing title", idx)
                continue
            if not record.get("provider_id"):
                logger.warning("Skipping record at index %d: missing provider_id", idx)
                continue
            valid.append(record)

        self._records = valid
        return self._records

    @staticmethod
    def _build_document_text(record: Dict) -> str:
        """Concatenate title + abstract for TF-IDF vectorization."""
        title = record.get("title", "")
        abstract = record.get("abstract", "")
        return f"{title} {abstract}".strip()

    # ------------------------------------------------------------------
    # SourceProvider interface
    # ------------------------------------------------------------------

    def search(self, keywords: List[str]) -> List[Dict]:
        """Rank corpus records against *keywords* using TF-IDF cosine similarity.

        Returns source dicts augmented with a ``candidate_score`` field
        (0.0–1.0) representing retrieval relevance.  Results are sorted
        by descending candidate_score.
        """
        records = self._load_corpus()

        if not keywords or not records:
            return []

        query_text = " ".join(keywords)

        # Build document corpus for TF-IDF
        doc_texts = [self._build_document_text(r) for r in records]

        # Vectorize: query + all documents
        vectorizer = TfidfVectorizer(stop_words="english", max_features=5000)
        try:
            tfidf_matrix = vectorizer.fit_transform([query_text] + doc_texts)
        except ValueError:
            # All documents are empty or only stop-words
            return []

        # Cosine similarity between query (row 0) and all docs (rows 1+)
        scores = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()

        # Pair scores with records and filter out zero-relevance
        scored = []
        for record, score in zip(records, scores):
            if score > 0.0:
                result = dict(record)
                result["candidate_score"] = round(float(score), 4)
                scored.append(result)

        # Sort descending by candidate_score
        scored.sort(key=lambda r: r["candidate_score"], reverse=True)

        return scored
