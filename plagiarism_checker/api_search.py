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
import time
from typing import Optional, Tuple


TIMEOUT = 8  # seconds per API call


# ──────────────────────────────────────────────
#  ASYNC HTTP HELPER (stdlib only — no aiohttp)
# ──────────────────────────────────────────────

async def _fetch(url: str, headers: dict = None, retries: int = 1) -> Optional[dict]:
    """
    Non-blocking HTTP GET using asyncio thread executor.
    Falls back gracefully on network errors.
    Includes retry logic.
    """
    def _sync_get():
        req = urllib.request.Request(url, headers=headers or {
            "User-Agent": "AcademicSuite-PlagiarismChecker/1.0"
        })
        for attempt in range(retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception:
                if attempt == retries:
                    return None
                time.sleep(1) # simple backoff
        return None

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get)


# ──────────────────────────────────────────────
#  SEMANTIC SCHOLAR
# ──────────────────────────────────────────────

async def search_semantic_scholar(query: str, limit: int = 15) -> tuple[list[dict], float]:
    """
    Search Semantic Scholar Public API.
    Endpoint: https://api.semanticscholar.org/graph/v1/paper/search
    """
    t_start = time.time()
    q = urllib.parse.quote(query)
    url = (
        f"https://api.semanticscholar.org/graph/v1/paper/search"
        f"?query={q}&limit={limit}"
        f"&fields=title,abstract,authors,year,externalIds,url"
    )
    data = await _fetch(url)
    elapsed = time.time() - t_start
    if not data or "data" not in data:
        return [], elapsed

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
    return papers, elapsed


# ──────────────────────────────────────────────
#  OPENALEX
# ──────────────────────────────────────────────

async def search_openalex(query: str, limit: int = 15) -> tuple[list[dict], float]:
    """
    Search OpenAlex API.
    Endpoint: https://api.openalex.org/works
    """
    t_start = time.time()
    q = urllib.parse.quote(query)
    url = (
        f"https://api.openalex.org/works"
        f"?search={q}&per-page={limit}"
        f"&mailto=academic.suite@example.com"
    )
    data = await _fetch(url)
    elapsed = time.time() - t_start
    if not data or "results" not in data:
        return [], elapsed

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
    return papers, elapsed


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

async def search_crossref(query: str, limit: int = 15) -> tuple[list[dict], float]:
    """
    Search Crossref REST API.
    Endpoint: https://api.crossref.org/works
    """
    t_start = time.time()
    q = urllib.parse.quote(query)
    url = (
        f"https://api.crossref.org/works"
        f"?query={q}&rows={limit}"
        f"&select=title,abstract,author,published,DOI,URL"
        f"&mailto=academic.suite@example.com"
    )
    data = await _fetch(url)
    elapsed = time.time() - t_start
    if not data or "message" not in data:
        return [], elapsed

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
    return papers, elapsed


# ──────────────────────────────────────────────
#  CONCURRENT SEARCH ORCHESTRATOR
# ──────────────────────────────────────────────

async def _gather_search(query: str, limit: int) -> tuple[list[dict], dict]:
    """Run all 3 APIs concurrently, merge and deduplicate by DOI."""
    results = await asyncio.gather(
        search_semantic_scholar(query, limit),
        search_openalex(query, limit),
        search_crossref(query, limit),
        return_exceptions=True
    )

    merged: list[dict] = []
    metrics = {
        "semantic_scholar": 0.0,
        "openalex": 0.0,
        "crossref": 0.0
    }
    
    if not isinstance(results[0], Exception):
        merged.extend(results[0][0])
        metrics["semantic_scholar"] = results[0][1]
    
    if not isinstance(results[1], Exception):
        merged.extend(results[1][0])
        metrics["openalex"] = results[1][1]
        
    if not isinstance(results[2], Exception):
        merged.extend(results[2][0])
        metrics["crossref"] = results[2][1]

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

    return deduped, metrics


def search_all(query: str, limit: int = 15) -> tuple[list[dict], dict]:
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
        return [], {}
