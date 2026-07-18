"""Tests for PAGGY offline scholarly retrieval pipeline.

Covers keyword extraction, query generation, corpus loading, TF-IDF ranking,
deduplication, search cache, and the /api/v1/sources/search endpoint.
"""

import json
import os
import tempfile

import pytest
import pytest_asyncio
from unittest.mock import patch

from app.services.keywords import extract_keywords, generate_search_queries
from app.services.source_deduplication import (
    deduplicate_sources,
    normalize_doi,
    normalize_title,
)
from app.services.offline_source_provider import OfflineSourceProvider
from app.services.search_cache import SearchCache


# ======================================================================
# 1. Keyword Extraction
# ======================================================================

class TestExtractKeywords:
    """Tests for extract_keywords()."""

    def test_basic_extraction(self):
        text = (
            "Deep learning techniques for natural language processing "
            "using transformers and attention mechanisms in neural networks."
        )
        keywords = extract_keywords(text)
        assert isinstance(keywords, list)
        assert len(keywords) >= 1

    def test_deterministic_output(self):
        text = "Machine learning algorithms for climate modeling and prediction."
        kw1 = extract_keywords(text)
        kw2 = extract_keywords(text)
        assert kw1 == kw2, "Keyword extraction must be deterministic"

    def test_empty_text(self):
        assert extract_keywords("") == []
        assert extract_keywords("   ") == []

    def test_short_text(self):
        keywords = extract_keywords("Hello world")
        # "hello" and "world" are < 3 chars or stop words - may be empty or small
        assert isinstance(keywords, list)

    def test_stopwords_removed(self):
        text = "the and of in to a for with on by an or"
        keywords = extract_keywords(text)
        assert keywords == [], "Pure stop words should produce no keywords"

    def test_max_keywords_capped(self):
        long_text = " ".join(f"keyword{i}" for i in range(100))
        keywords = extract_keywords(long_text, max_keywords=15)
        assert len(keywords) <= 15

    def test_reference_noise_filtered(self):
        text = "vol pp doi isbn journal press publisher 2020 2021"
        keywords = extract_keywords(text)
        # reference-section noise words and pure numbers should be filtered
        for kw in keywords:
            assert kw not in {"vol", "doi", "isbn", "journal", "press", "publisher"}
            assert not kw.isdigit()


# ======================================================================
# 2. Query Generation
# ======================================================================

class TestGenerateSearchQueries:
    """Tests for generate_search_queries()."""

    def test_basic_queries(self):
        keywords = ["deep", "learning", "nlp", "transformers", "attention", "neural"]
        queries = generate_search_queries(keywords)
        assert isinstance(queries, list)
        assert 2 <= len(queries) <= 3

    def test_empty_keywords(self):
        assert generate_search_queries([]) == []

    def test_few_keywords(self):
        queries = generate_search_queries(["one", "two"])
        assert len(queries) == 1
        assert queries[0] == "one two"

    def test_deterministic(self):
        keywords = ["alpha", "beta", "gamma", "delta", "epsilon"]
        q1 = generate_search_queries(keywords)
        q2 = generate_search_queries(keywords)
        assert q1 == q2


# ======================================================================
# 3. Corpus Loading
# ======================================================================

class TestCorpusLoading:
    """Tests for OfflineSourceProvider corpus loading."""

    def test_default_corpus_loads(self):
        provider = OfflineSourceProvider()
        records = provider._load_corpus()
        assert isinstance(records, list)
        assert len(records) == 20

    def test_configurable_corpus_path(self):
        """Verify that tests can override the corpus path."""
        custom_corpus = [
            {
                "provider": "demo_corpus",
                "provider_id": "demo-test-001",
                "title": "Test Title",
                "abstract": "Test abstract content.",
                "authors": ["Tester"],
                "publication_year": 2024,
                "venue": "Test Venue",
                "doi": None,
                "url": None,
            }
        ]
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(custom_corpus, f)
            f.flush()
            path = f.name

        try:
            provider = OfflineSourceProvider(corpus_path=path)
            records = provider._load_corpus()
            assert len(records) == 1
            assert records[0]["provider_id"] == "demo-test-001"
        finally:
            os.unlink(path)

    def test_missing_corpus_raises(self):
        provider = OfflineSourceProvider(corpus_path="/nonexistent/corpus.json")
        with pytest.raises(FileNotFoundError, match="Offline corpus not found"):
            provider._load_corpus()

    def test_malformed_record_skipped(self):
        """Records missing required fields are silently skipped."""
        corpus = [
            {"title": "Valid Record", "provider_id": "demo-v1", "provider": "demo_corpus"},
            {"abstract": "No title or id"},  # malformed
            "not a dict",  # malformed
            {"title": "", "provider_id": "demo-v2"},  # empty title
        ]
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(corpus, f)
            path = f.name

        try:
            provider = OfflineSourceProvider(corpus_path=path)
            records = provider._load_corpus()
            assert len(records) == 1
            assert records[0]["provider_id"] == "demo-v1"
        finally:
            os.unlink(path)

    def test_corpus_provider_ids_format(self):
        """All demo records should have provider=demo_corpus and provider_id starting with demo-."""
        provider = OfflineSourceProvider()
        records = provider._load_corpus()
        for r in records:
            assert r["provider"] == "demo_corpus", f"Provider mismatch: {r.get('provider_id')}"
            assert r["provider_id"].startswith("demo-"), f"Bad provider_id: {r['provider_id']}"


# ======================================================================
# 4. Source Ranking
# ======================================================================

class TestSourceRanking:
    """Tests for TF-IDF-based source ranking."""

    def test_ranking_returns_scored_results(self):
        provider = OfflineSourceProvider()
        results = provider.search(["deep", "learning", "natural", "language"])
        assert len(results) > 0
        for r in results:
            assert "candidate_score" in r
            assert 0.0 < r["candidate_score"] <= 1.0

    def test_score_range(self):
        provider = OfflineSourceProvider()
        results = provider.search(["quantum", "computing", "algorithms"])
        for r in results:
            assert 0.0 < r["candidate_score"] <= 1.0

    def test_empty_keywords_returns_empty(self):
        provider = OfflineSourceProvider()
        assert provider.search([]) == []

    def test_irrelevant_keywords(self):
        provider = OfflineSourceProvider()
        results = provider.search(["xyzzyplugh", "flibbertigibbet"])
        # May return empty or very low scores
        assert isinstance(results, list)


# ======================================================================
# 5. Title Normalization and Deduplication
# ======================================================================

class TestDeduplication:
    """Tests for source deduplication."""

    def test_title_normalization(self):
        assert normalize_title("Deep  Learning!!") == "deep learning"
        assert normalize_title("  HELLO  World  ") == "hello world"

    def test_doi_normalization(self):
        assert normalize_doi(None) is None
        assert normalize_doi("") is None
        assert normalize_doi("https://doi.org/10.1234/test") == "10.1234/test"
        assert normalize_doi("10.1234/TEST") == "10.1234/test"

    def test_dedup_by_provider_id(self):
        sources = [
            {"provider_id": "demo-001", "title": "A", "candidate_score": 0.8},
            {"provider_id": "demo-001", "title": "B", "candidate_score": 0.9},
        ]
        result = deduplicate_sources(sources)
        assert len(result) == 1
        assert result[0]["candidate_score"] == 0.9  # highest score preserved

    def test_dedup_by_title(self):
        sources = [
            {"title": "Deep Learning", "candidate_score": 0.5},
            {"title": "deep  learning!!", "candidate_score": 0.3},
        ]
        result = deduplicate_sources(sources)
        assert len(result) == 1
        assert result[0]["candidate_score"] == 0.5

    def test_no_duplicates(self):
        sources = [
            {"provider_id": "demo-001", "title": "A", "candidate_score": 0.5},
            {"provider_id": "demo-002", "title": "B", "candidate_score": 0.6},
        ]
        result = deduplicate_sources(sources)
        assert len(result) == 2


# ======================================================================
# 6. Search Cache
# ======================================================================

class TestSearchCache:
    """Tests for SearchCache wrapper."""

    @pytest.mark.asyncio
    async def test_cache_miss(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        try:
            cache = SearchCache(sqlite_path=db_path)
            cache.reset_stats()
            result = await cache.get("nonexistent-key")
            assert result is None
            assert cache.stats["misses"] == 1
            assert cache.stats["hits"] == 0
        finally:
            os.unlink(db_path)

    @pytest.mark.asyncio
    async def test_cache_hit(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        try:
            cache = SearchCache(sqlite_path=db_path)
            cache.reset_stats()
            await cache.set("test-key", {"data": "value"}, ttl=3600)
            result = await cache.get("test-key")
            assert result == {"data": "value"}
            assert cache.stats["hits"] == 1
            assert cache.stats["writes"] == 1
        finally:
            os.unlink(db_path)

    def test_make_key_deterministic(self):
        k1 = SearchCache.make_key("doc_sources", "abc123")
        k2 = SearchCache.make_key("doc_sources", "abc123")
        assert k1 == k2
        assert k1.startswith("paggy:doc_sources:")


# ======================================================================
# 7. API Endpoint Integration Tests
# ======================================================================

@pytest.fixture
def test_client():
    """Create a TestClient for the FastAPI app."""
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


@pytest.fixture
def mock_auth_header():
    """Return a mock Authorization header."""
    return {"Authorization": "Bearer mock-test-token"}


class TestSearchEndpoint:
    """Integration tests for POST /api/v1/sources/search."""

    def test_scan_not_found(self, test_client, mock_auth_header):
        resp = test_client.post(
            "/api/v1/sources/search",
            json={"scan_id": "nonexistent-scan-id"},
            headers=mock_auth_header,
        )
        assert resp.status_code == 404

    def test_successful_search(self, test_client, mock_auth_header):
        # First ingest a document
        ingest_resp = test_client.post(
            "/api/v1/documents/extract",
            data={"pasted_text": (
                "Deep learning techniques for natural language processing "
                "using neural networks transformers and attention mechanisms "
                "in modern artificial intelligence research applications."
            )},
            headers=mock_auth_header,
        )
        assert ingest_resp.status_code == 200
        scan_id = ingest_resp.json()["scan_id"]

        # Now search
        search_resp = test_client.post(
            "/api/v1/sources/search",
            json={"scan_id": scan_id},
            headers=mock_auth_header,
        )
        assert search_resp.status_code == 200
        data = search_resp.json()

        # Verify response structure
        assert data["scan_id"] == scan_id
        assert data["mode"] == "offline"
        assert isinstance(data["keywords"], list)
        assert len(data["keywords"]) >= 1
        assert isinstance(data["search_queries"], list)
        assert isinstance(data["sources"], list)
        assert isinstance(data["deduplication"], dict)
        assert isinstance(data["cache"], dict)
        assert isinstance(data["limitations"], list)

    def test_limitations_included(self, test_client, mock_auth_header):
        ingest_resp = test_client.post(
            "/api/v1/documents/extract",
            data={"pasted_text": "Quantum computing algorithms and applications"},
            headers=mock_auth_header,
        )
        scan_id = ingest_resp.json()["scan_id"]

        search_resp = test_client.post(
            "/api/v1/sources/search",
            json={"scan_id": scan_id},
            headers=mock_auth_header,
        )
        data = search_resp.json()
        assert len(data["limitations"]) >= 2
        assert any("synthetic" in lim.lower() for lim in data["limitations"])
        assert any("disabled" in lim.lower() or "offline" in lim.lower() for lim in data["limitations"])

    def test_no_secrets_in_response(self, test_client, mock_auth_header):
        ingest_resp = test_client.post(
            "/api/v1/documents/extract",
            data={"pasted_text": "Machine learning for climate modeling and prediction accuracy"},
            headers=mock_auth_header,
        )
        scan_id = ingest_resp.json()["scan_id"]

        search_resp = test_client.post(
            "/api/v1/sources/search",
            json={"scan_id": scan_id},
            headers=mock_auth_header,
        )
        response_text = json.dumps(search_resp.json())
        # No filesystem paths
        assert "demo_scholarly_sources.json" not in response_text
        assert ":\\\\".lower() not in response_text.lower()
        assert "/data/" not in response_text
        # No env vars or secrets
        assert "SUPABASE" not in response_text
        assert "REDIS_URL" not in response_text
        assert "API_KEY" not in response_text

    def test_no_api_key_required(self, test_client, mock_auth_header):
        """The search endpoint should work without any external API keys."""
        ingest_resp = test_client.post(
            "/api/v1/documents/extract",
            data={"pasted_text": "Blockchain technology in supply chain management"},
            headers=mock_auth_header,
        )
        scan_id = ingest_resp.json()["scan_id"]

        # Search should succeed even with no external API keys configured
        search_resp = test_client.post(
            "/api/v1/sources/search",
            json={"scan_id": scan_id},
            headers=mock_auth_header,
        )
        assert search_resp.status_code == 200
        assert search_resp.json()["mode"] == "offline"
