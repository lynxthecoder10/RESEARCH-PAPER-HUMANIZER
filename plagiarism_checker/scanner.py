"""
Academic Suite — Plagiarism Checker
Main scan orchestrator — implements the full cache-first architecture:

  Hash Hit  → return cached report  (1-2s)
  KW Hit    → reuse metadata + similarity  (3-5s)
  Cache Miss → API search → save → similarity → report  (6-12s)
"""

import uuid
import time

from db        import (init_db, find_scan_by_hash, get_matches_for_scan,
                        find_papers_by_keywords, upsert_papers, save_scan, db_stats)
from extractor import process_file, process_text
from keywords  import extract_keywords, keywords_to_query
from api_search import search_all
from checker   import tfidf_similarity, sequence_similarity


# ──────────────────────────────────────────────
#  SIMILARITY ENGINE (document vs. paper corpus)
# ──────────────────────────────────────────────

def _score_against_papers(
    doc_text: str,
    paragraphs: list[str],
    papers: list[dict],
    paper_ids: list[str],
    sim_threshold: float = 0.15,
) -> list[dict]:
    """
    For each cached paper, compute TF-IDF similarity between the document
    and the paper's abstract. Also check each paragraph against the abstract
    to find the most similar passage.

    Returns list of match dicts sorted by similarity desc.
    """
    matches = []
    for paper, pid in zip(papers, paper_ids):
        ref_text = " ".join(filter(None, [
            paper.get("title", ""),
            paper.get("abstract", ""),
            " ".join(paper.get("keywords", [])),
        ]))
        if not ref_text.strip():
            continue

        # Overall document similarity
        doc_score = tfidf_similarity(doc_text, ref_text)

        # Find most similar paragraph
        best_para = ""
        best_para_score = 0.0
        for para in paragraphs[:20]:  # limit to first 20 paras for speed
            ps = sequence_similarity(para, ref_text)
            if ps > best_para_score:
                best_para_score = ps
                best_para = para

        final_score = max(doc_score, best_para_score * 0.7)

        if final_score >= sim_threshold:
            matches.append({
                "paper_id":   pid,
                "similarity": round(final_score * 100, 2),
                "paragraph":  best_para[:500] if best_para_score > 0.3 else "",
                # Extra display fields (not stored in similarity_matches)
                "_title":     paper.get("title", ""),
                "_authors":   paper.get("authors", []),
                "_year":      paper.get("year"),
                "_doi":       paper.get("doi"),
                "_url":       paper.get("url", ""),
                "_source":    paper.get("source", ""),
            })

    matches.sort(key=lambda m: m["similarity"], reverse=True)
    return matches


# ──────────────────────────────────────────────
#  AI CONTENT SCORE (heuristic, no external API)
# ──────────────────────────────────────────────

def _estimate_ai_score(text: str) -> float:
    """
    Lightweight heuristic AI content detector.
    Checks for common AI writing patterns:
    - Overly uniform sentence length
    - High frequency of filler phrases
    - Repetitive transitional words
    Returns 0.0 to 1.0 (probability of AI-generated content).
    """
    import re
    import statistics

    AI_PHRASES = [
        "in conclusion", "it is worth noting", "it is important to",
        "in this paper we", "this paper presents", "the results show",
        "furthermore", "moreover", "in addition", "as mentioned above",
        "as a result", "it can be seen", "this study aims",
        "in summary", "overall", "notably", "delve", "utilize",
        "it should be noted", "the proposed method",
    ]

    text_lower = text.lower()
    phrase_hits = sum(1 for p in AI_PHRASES if p in text_lower)
    phrase_score = min(phrase_hits / 8, 1.0)

    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 10]
    if len(sentences) >= 5:
        lengths = [len(s.split()) for s in sentences]
        mean_len = statistics.mean(lengths)
        try:
            stdev_len = statistics.stdev(lengths)
            uniformity = 1 - min(stdev_len / (mean_len + 1), 1.0)
        except statistics.StatisticsError:
            uniformity = 0.5
    else:
        uniformity = 0.5

    return round(phrase_score * 0.6 + uniformity * 0.4, 3)


# ──────────────────────────────────────────────
#  MAIN SCAN FUNCTION
# ──────────────────────────────────────────────

def scan_document(
    filepath: str = None,
    raw_text:  str = None,
    label:     str = "document",
    verbose:   bool = True,
) -> dict:
    """
    Full scan pipeline. Accepts either a file path or raw text.
    Returns a structured report dict.
    """
    init_db()
    t_start = time.time()

    def log(msg):
        if verbose:
            print(f"  [>] {msg}")

    # ── EXTRACTION ────────────────────────────
    log("Extracting and cleaning document...")
    if filepath:
        doc = process_file(filepath)
    elif raw_text:
        doc = process_text(raw_text, label)
    else:
        raise ValueError("Provide either filepath or raw_text.")

    doc_hash   = doc["hash"]
    doc_text   = doc["clean_text"]
    paragraphs = doc["paragraphs"]
    filename   = doc["filename"]

    log(f"Words: {doc['word_count']} | Hash: {doc_hash[:12]}...")

    # ── LEVEL 1: HASH CACHE ───────────────────
    log("Checking Level 1 cache (document hash)...")
    cached_scan = find_scan_by_hash(doc_hash)
    if cached_scan:
        log("Cache HIT (hash) — returning cached report instantly.")
        matches = get_matches_for_scan(cached_scan["scan_id"])
        return _build_report(cached_scan, matches, "hash", time.time() - t_start)

    # ── KEYWORD EXTRACTION ────────────────────
    log("Extracting keywords...")
    keywords = extract_keywords(doc_text, top_n=12)
    log(f"Keywords: {', '.join(keywords[:6])}")

    # ── LEVEL 2: KEYWORD CACHE ────────────────
    log("Checking Level 2 cache (keywords)...")
    cached_papers = find_papers_by_keywords(keywords)
    cache_hit_type = "keyword" if cached_papers else "miss"

    if cached_papers:
        log(f"Cache HIT (keywords) — {len(cached_papers)} papers reused from DB.")
        paper_ids = [p["id"] for p in cached_papers]
        import json
        for p in cached_papers:
            if isinstance(p.get("keywords"), str):
                p["keywords"] = json.loads(p["keywords"])
            if isinstance(p.get("authors"), str):
                p["authors"] = json.loads(p["authors"])
        papers = cached_papers
    else:
        # ── LEVEL 3: EXTERNAL API ─────────────
        query = keywords_to_query(keywords)
        log(f"Cache MISS — querying APIs: '{query}'")
        api_papers = search_all(query, limit=20)
        log(f"API returned {len(api_papers)} papers (after deduplication).")

        if not api_papers:
            log("No API results. Proceeding with local analysis only.")
            api_papers = []

        paper_ids = upsert_papers(api_papers)
        papers    = api_papers

    # ── SIMILARITY ENGINE ─────────────────────
    log("Running similarity analysis...")
    matches = _score_against_papers(doc_text, paragraphs, papers, paper_ids)
    log(f"Found {len(matches)} similar papers above threshold.")

    # ── SCORES ───────────────────────────────
    top_similarity  = matches[0]["similarity"] if matches else 0.0
    originality     = round(max(0, 100 - top_similarity), 2)
    ai_score        = _estimate_ai_score(doc_text)

    # ── SAVE SCAN ────────────────────────────
    scan_id = str(uuid.uuid4())
    save_scan(
        scan_id     = scan_id,
        filename    = filename,
        doc_hash    = doc_hash,
        keywords    = keywords,
        similarity  = top_similarity,
        originality = originality,
        ai_score    = ai_score,
        cache_hit   = cache_hit_type,
        matches     = [
            {"paper_id": m["paper_id"], "similarity": m["similarity"], "paragraph": m["paragraph"]}
            for m in matches
        ]
    )

    elapsed = round(time.time() - t_start, 2)
    log(f"Scan complete in {elapsed}s | Cache: {cache_hit_type.upper()}")

    return {
        "scan_id":          scan_id,
        "filename":         filename,
        "word_count":       doc["word_count"],
        "keywords":         keywords,
        "similarity":       top_similarity,
        "originality":      originality,
        "ai_score":         round(ai_score * 100, 1),
        "cache_hit":        cache_hit_type,
        "elapsed_seconds":  elapsed,
        "matches":          matches[:10],  # top 10 for report
        "total_matches":    len(matches),
    }


def _build_report(scan_row: dict, matches: list[dict], cache_hit: str, elapsed: float) -> dict:
    """Build a report dict from a cached scan row."""
    import json
    kw = scan_row.get("keywords", "[]")
    if isinstance(kw, str):
        kw = json.loads(kw)
    return {
        "scan_id":         scan_row["scan_id"],
        "filename":        scan_row.get("filename", ""),
        "word_count":      None,
        "keywords":        kw,
        "similarity":      scan_row["similarity"],
        "originality":     scan_row["originality"],
        "ai_score":        round((scan_row.get("ai_score") or 0) * 100, 1),
        "cache_hit":       cache_hit,
        "elapsed_seconds": round(elapsed, 2),
        "matches":         matches[:10],
        "total_matches":   len(matches),
    }
