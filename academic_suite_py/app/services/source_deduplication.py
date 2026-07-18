"""Source deduplication utilities.

Deduplicates a list of source dictionaries by normalized DOI, provider_id,
or normalized title. When duplicates are found, preserves the entry with
the highest ``candidate_score``.
"""

import re
from typing import List, Dict, Optional


def normalize_doi(doi: Optional[str]) -> Optional[str]:
    """Normalize a DOI string for comparison.

    Lowercases, strips whitespace, and removes any leading 'https://doi.org/' prefix.
    Returns ``None`` if the input is empty/None.
    """
    if not doi or not doi.strip():
        return None
    normalized = doi.strip().lower()
    # Strip common URL prefixes
    for prefix in ("https://doi.org/", "http://doi.org/", "http://dx.doi.org/", "https://dx.doi.org/"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    return normalized if normalized else None


def normalize_title(title: str) -> str:
    """Normalize a title for comparison.

    Lower-case, remove non-alphanumeric chars, collapse whitespace.
    """
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", title.lower())).strip()


def deduplicate_sources(sources: List[Dict]) -> List[Dict]:
    """Deduplicate a list of source dictionaries.

    Deduplication priority:
    1. If a DOI is present and identical (normalized), keep the higher-scoring entry.
    2. Otherwise, if ``provider_id`` matches, keep the higher-scoring entry.
    3. Otherwise, compare normalized titles.

    Returns the deduplicated list in original order (stable), preserving
    the entry with the highest ``candidate_score`` for each duplicate group.
    """
    # Map dedup key → best record (highest candidate_score)
    seen: Dict[tuple, Dict] = {}
    order: List[tuple] = []

    for src in sources:
        score = src.get("candidate_score", 0.0)

        # Determine dedup key
        doi = normalize_doi(src.get("doi"))
        if doi:
            key = ("doi", doi)
        else:
            provider_id = src.get("provider_id")
            if provider_id:
                key = ("provider_id", provider_id)
            else:
                key = ("title", normalize_title(src.get("title", "")))

        if key in seen:
            # Keep the one with higher candidate_score
            existing_score = seen[key].get("candidate_score", 0.0)
            if score > existing_score:
                seen[key] = src
        else:
            seen[key] = src
            order.append(key)

    return [seen[k] for k in order]
