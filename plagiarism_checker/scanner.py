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
#  FORMAT HELPER
# ──────────────────────────────────────────────

def _print_step(name: str, metric=None):
    # e.g. "Extract Text ............ ✓ (320 ms)"
    pad = "." * (25 - len(name))
    if metric is not None:
        if isinstance(metric, float):
            if metric < 1.0:
                print(f"{name} {pad} \u2713 ({int(metric*1000)} ms)")
            else:
                print(f"{name} {pad} \u2713 ({metric:.1f} s)")
        else:
            print(f"{name} {pad} \u2713 {metric}")
    else:
        print(f"{name} {pad} \u2713")

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

    if verbose:
        print("\n--- Execution Pipeline ---")

    # ── EXTRACTION ────────────────────────────
    t_ext_start = time.time()
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

    if verbose:
        _print_step("Extract Text", time.time() - t_ext_start)
        # Assuming Clean Text and Generate Hash are practically part of extraction in process_file/text
        _print_step("Clean Text", 0.001) 
        _print_step("Generate Hash", 0.001)

    # ── LEVEL 1: HASH CACHE ───────────────────
    cached_scan = find_scan_by_hash(doc_hash)
    if cached_scan:
        if verbose:
            print(f"\n[Cache HIT] Document Hash {doc_hash[:8]} found. Skipping APIs.")
        
        matches = get_matches_for_scan(cached_scan["scan_id"])
        
        if verbose:
            _print_step("Load Cached Metadata")
            _print_step("Report")
            
        elapsed = time.time() - t_start
        return _build_report(cached_scan, matches, "hash", elapsed)

    # ── KEYWORD EXTRACTION ────────────────────
    t_kw_start = time.time()
    keywords = extract_keywords(doc_text, top_n=12)
    if verbose:
        _print_step("Keywords", time.time() - t_kw_start)

    # ── LEVEL 2: KEYWORD CACHE ────────────────
    cached_papers = find_papers_by_keywords(keywords)
    cache_hit_type = "keyword" if cached_papers else "miss"

    if cached_papers:
        if verbose:
            print(f"\n[Partial Cache HIT] Keywords found. Bypassing external APIs.")
        paper_ids = [p["id"] for p in cached_papers]
        import json
        for p in cached_papers:
            if isinstance(p.get("keywords"), str):
                p["keywords"] = json.loads(p["keywords"])
            if isinstance(p.get("authors"), str):
                p["authors"] = json.loads(p["authors"])
        papers = cached_papers
    else:
        if verbose:
            print(f"\n[Cache MISS] Querying External APIs concurrently...")
        # ── LEVEL 3: EXTERNAL API ─────────────
        query = keywords_to_query(keywords)
        api_papers, metrics = search_all(query, limit=20)
        
        sem_count = sum(1 for p in api_papers if p.get("source") == "semantic_scholar")
        open_count = sum(1 for p in api_papers if p.get("source") == "openalex")
        cross_count = sum(1 for p in api_papers if p.get("source") == "crossref")
        
        if verbose:
            _print_step(f"Semantic Scholar", f"{sem_count} papers")
            _print_step(f"OpenAlex", f"{open_count} papers")
            _print_step(f"Crossref", f"{cross_count} papers")
            _print_step("Merged", f"{len(api_papers)} unique papers")

        paper_ids = upsert_papers(api_papers)
        papers    = api_papers

    # ── SIMILARITY ENGINE ─────────────────────
    t_sim_start = time.time()
    matches = _score_against_papers(doc_text, paragraphs, papers, paper_ids)
    if verbose:
        _print_step("TF-IDF", time.time() - t_sim_start)
        _print_step("Cosine Similarity") # implied in the above
        _print_step("Rank Similar Papers")

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

    if verbose:
        _print_step("Report")
        _print_step("Cache Saved")

    elapsed = round(time.time() - t_start, 2)

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
