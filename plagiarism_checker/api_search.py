"""
Academic Suite — Plagiarism Checker
Concurrent external API search:
  - Semantic Scholar
  - OpenAlex
  - Crossref
All three run concurrently via asyncio.gather().
Results are deduplicated by DOI before returning.
"""

import asyncio
import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional


TIMEOUT = 8  # seconds per API call


# ──────────────────────────────────────────────
#  ASYNC HTTP HELPER (stdlib only — no aiohttp)
# ──────────────────────────────────────────────

async def _fetch(url: str, headers: dict = None) -> Optional[dict]:
    """
    Non-blocking HTTP GET using asyncio thread executor.
    Falls back gracefully on network errors.
    """
    def _sync_get():
        req = urllib.request.Request(url, headers=headers or {
            "User-Agent": "AcademicSuite-PlagiarismChecker/1.0"
        })
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get)


# ──────────────────────────────────────────────
#  SEMANTIC SCHOLAR
# ──────────────────────────────────────────────

async def search_semantic_scholar(query: str, limit: int = 15) -> list[dict]:
    """
    Search Semantic Scholar Public API.
    Endpoint: https://api.semanticscholar.org/graph/v1/paper/search
    """
    q = urllib.parse.quote(query)
    url = (
        f"https://api.semanticscholar.org/graph/v1/paper/search"
        f"?query={q}&limit={limit}"
        f"&fields=title,abstract,authors,year,externalIds,url"
    )
    data = await _fetch(url)
    if not data or "data" not in data:
        return []

    papers = []
    for p in data["data"]:
        doi = (p.get("externalIds") or {}).get("DOI")
        papers.append({
            "title":    p.get("title", ""),
            "abstract": p.get("abstract", "") or "",
            "authors":  [a.get("name", "") for a in (p.get("authors") or [])],
            "year":     p.get("year"),
            "doi":      doi,
            "url":      p.get("url", ""),
            "source":   "semantic_scholar",
            "keywords": [],
        })
    return papers


# ──────────────────────────────────────────────
#  OPENALEX
# ──────────────────────────────────────────────

async def search_openalex(query: str, limit: int = 15) -> list[dict]:
    """
    Search OpenAlex API.
    Endpoint: https://api.openalex.org/works
    """
    q = urllib.parse.quote(query)
    url = (
        f"https://api.openalex.org/works"
        f"?search={q}&per-page={limit}"
        f"&mailto=academic.suite@example.com"
    )
    data = await _fetch(url)
    if not data or "results" not in data:
        return []

    papers = []
    for p in data["results"]:
        doi = p.get("doi", "")
        if doi and doi.startswith("https://doi.org/"):
            doi = doi.replace("https://doi.org/", "")

        abstract_index = p.get("abstract_inverted_index") or {}
        abstract = _reconstruct_abstract(abstract_index)

        authors = []
        for auth in (p.get("authorships") or [])[:5]:
            name = (auth.get("author") or {}).get("display_name", "")
            if name:
                authors.append(name)

        concepts = [c.get("display_name", "") for c in (p.get("concepts") or [])[:6]]

        papers.append({
            "title":    p.get("title", "") or "",
            "abstract": abstract,
            "authors":  authors,
            "year":     p.get("publication_year"),
            "doi":      doi or None,
            "url":      p.get("primary_location", {}).get("landing_page_url", "") if p.get("primary_location") else "",
            "source":   "openalex",
            "keywords": concepts,
        })
    return papers


def _reconstruct_abstract(inverted_index: dict) -> str:
    """Reconstruct OpenAlex abstract from inverted index."""
    if not inverted_index:
        return ""
    word_positions = []
    for word, positions in inverted_index.items():
        for pos in positions:
            word_positions.append((pos, word))
    word_positions.sort()
    return " ".join(w for _, w in word_positions)


# ──────────────────────────────────────────────
#  CROSSREF
# ──────────────────────────────────────────────

async def search_crossref(query: str, limit: int = 15) -> list[dict]:
    """
    Search Crossref REST API.
    Endpoint: https://api.crossref.org/works
    """
    q = urllib.parse.quote(query)
    url = (
        f"https://api.crossref.org/works"
        f"?query={q}&rows={limit}"
        f"&select=title,abstract,author,published,DOI,URL"
        f"&mailto=academic.suite@example.com"
    )
    data = await _fetch(url)
    if not data or "message" not in data:
        return []

    papers = []
    for p in (data["message"].get("items") or []):
        title_list = p.get("title") or [""]
        abstract_raw = p.get("abstract", "") or ""
        # Strip HTML tags from Crossref abstracts
        import re
        abstract = re.sub(r"<[^>]+>", "", abstract_raw).strip()

        authors = []
        for a in (p.get("author") or [])[:5]:
            given  = a.get("given", "")
            family = a.get("family", "")
            name   = f"{given} {family}".strip()
            if name:
                authors.append(name)

        pub_date = p.get("published", {}).get("date-parts", [[None]])
        year = pub_date[0][0] if pub_date and pub_date[0] else None

        papers.append({
            "title":    title_list[0] if title_list else "",
            "abstract": abstract,
            "authors":  authors,
            "year":     year,
            "doi":      p.get("DOI"),
            "url":      p.get("URL", ""),
            "source":   "crossref",
            "keywords": [],
        })
    return papers


# ──────────────────────────────────────────────
#  CONCURRENT SEARCH ORCHESTRATOR
# ──────────────────────────────────────────────

async def _gather_search(query: str, limit: int) -> list[dict]:
    """Run all 3 APIs concurrently, merge and deduplicate by DOI."""
    results = await asyncio.gather(
        search_semantic_scholar(query, limit),
        search_openalex(query, limit),
        search_crossref(query, limit),
        return_exceptions=True
    )

    merged: list[dict] = []
    for r in results:
        if isinstance(r, list):
            merged.extend(r)

    # DOI deduplication — keep first occurrence
    seen_dois: set[str] = set()
    deduped: list[dict] = []
    for p in merged:
        doi = p.get("doi") or ""
        if doi and doi in seen_dois:
            continue
        if doi:
            seen_dois.add(doi)
        deduped.append(p)

    return deduped


def search_all(query: str, limit: int = 15) -> list[dict]:
    """
    Synchronous wrapper for concurrent API search.
    Safe to call from non-async contexts.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Already in async context — create a new loop in thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _gather_search(query, limit))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(_gather_search(query, limit))
    except Exception:
        return []
