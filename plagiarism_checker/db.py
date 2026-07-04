"""
Academic Suite — Plagiarism Checker
Database layer: SQLite with 3 tables — papers_cache, scans, similarity_matches.
Cache-first retrieval architecture.
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "plagiarism.db")
CACHE_TTL_DAYS = 30


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    with _connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS papers_cache (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                doi         TEXT UNIQUE,
                abstract    TEXT,
                keywords    TEXT,       -- JSON array
                source      TEXT,       -- semantic_scholar | openalex | crossref
                authors     TEXT,       -- JSON array
                year        INTEGER,
                url         TEXT,
                created_at  TEXT NOT NULL,
                expires_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scans (
                scan_id       TEXT PRIMARY KEY,
                filename      TEXT,
                document_hash TEXT NOT NULL,
                keywords      TEXT,       -- JSON array of extracted keywords
                similarity    REAL,
                originality   REAL,
                ai_score      REAL,
                cache_hit     TEXT,       -- 'hash' | 'keyword' | 'miss'
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS similarity_matches (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id     TEXT NOT NULL REFERENCES scans(scan_id),
                paper_id    TEXT NOT NULL REFERENCES papers_cache(id),
                similarity  REAL,
                paragraph   TEXT,
                UNIQUE(scan_id, paper_id)
            );

            CREATE INDEX IF NOT EXISTS idx_papers_doi     ON papers_cache(doi);
            CREATE INDEX IF NOT EXISTS idx_papers_kw      ON papers_cache(keywords);
            CREATE INDEX IF NOT EXISTS idx_scans_hash     ON scans(document_hash);
            CREATE INDEX IF NOT EXISTS idx_matches_scan   ON similarity_matches(scan_id);
        """)


# ──────────────────────────────────────────────
#  HASH LOOKUP  (Level 1 — fastest path)
# ──────────────────────────────────────────────

def find_scan_by_hash(doc_hash: str) -> dict | None:
    """Return a previous scan result if the exact same document was scanned."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM scans WHERE document_hash = ? ORDER BY created_at DESC LIMIT 1",
            (doc_hash,)
        ).fetchone()
    return dict(row) if row else None


def get_matches_for_scan(scan_id: str) -> list[dict]:
    """Retrieve all similarity matches for a scan, joined with paper metadata."""
    with _connect() as conn:
        rows = conn.execute("""
            SELECT sm.similarity, sm.paragraph,
                   p.title, p.doi, p.authors, p.year, p.url, p.source
            FROM   similarity_matches sm
            JOIN   papers_cache p ON p.id = sm.paper_id
            WHERE  sm.scan_id = ?
            ORDER  BY sm.similarity DESC
        """, (scan_id,)).fetchall()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────────
#  KEYWORD CACHE  (Level 2 — partial hit)
# ──────────────────────────────────────────────

def find_papers_by_keywords(keywords: list[str], limit: int = 30) -> list[dict]:
    """
    Return cached papers whose stored keyword JSON overlaps with the input keywords.
    Uses SQLite LIKE search — fast enough for typical corpus sizes.
    """
    if not keywords:
        return []
    now = datetime.utcnow().isoformat()
    results = []
    seen_ids = set()

    with _connect() as conn:
        for kw in keywords[:8]:  # check top 8 keywords
            rows = conn.execute(
                "SELECT * FROM papers_cache WHERE keywords LIKE ? AND expires_at > ? LIMIT ?",
                (f'%{kw}%', now, limit)
            ).fetchall()
            for r in rows:
                d = dict(r)
                if d["id"] not in seen_ids:
                    seen_ids.add(d["id"])
                    results.append(d)

    return results


# ──────────────────────────────────────────────
#  CACHE WRITE
# ──────────────────────────────────────────────

def upsert_papers(papers: list[dict]) -> list[str]:
    """
    Insert or update papers in the cache.
    Deduplicates by DOI. Returns list of stored paper IDs.
    """
    now = datetime.utcnow().isoformat()
    expires = (datetime.utcnow() + timedelta(days=CACHE_TTL_DAYS)).isoformat()
    stored_ids = []

    with _connect() as conn:
        for p in papers:
            doi = p.get("doi") or None
            paper_id = str(uuid.uuid4())

            # DOI deduplication: if DOI exists, update and return existing ID
            if doi:
                existing = conn.execute(
                    "SELECT id FROM papers_cache WHERE doi = ?", (doi,)
                ).fetchone()
                if existing:
                    paper_id = existing["id"]
                    conn.execute("""
                        UPDATE papers_cache SET
                            title=?, abstract=?, keywords=?, authors=?,
                            year=?, url=?, source=?, expires_at=?
                        WHERE doi=?
                    """, (
                        p.get("title", ""),
                        p.get("abstract", ""),
                        json.dumps(p.get("keywords", [])),
                        json.dumps(p.get("authors", [])),
                        p.get("year"),
                        p.get("url", ""),
                        p.get("source", ""),
                        expires,
                        doi
                    ))
                    stored_ids.append(paper_id)
                    continue

            conn.execute("""
                INSERT OR IGNORE INTO papers_cache
                    (id, title, doi, abstract, keywords, source, authors, year, url, created_at, expires_at)
                VALUES (?,  ?,     ?,   ?,        ?,        ?,      ?,       ?,    ?,   ?,          ?)
            """, (
                paper_id,
                p.get("title", ""),
                doi,
                p.get("abstract", ""),
                json.dumps(p.get("keywords", [])),
                p.get("source", ""),
                json.dumps(p.get("authors", [])),
                p.get("year"),
                p.get("url", ""),
                now,
                expires
            ))
            stored_ids.append(paper_id)

    return stored_ids


def save_scan(
    scan_id: str,
    filename: str,
    doc_hash: str,
    keywords: list[str],
    similarity: float,
    originality: float,
    ai_score: float,
    cache_hit: str,
    matches: list[dict],   # [{paper_id, similarity, paragraph}]
):
    now = datetime.utcnow().isoformat()
    with _connect() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO scans
                (scan_id, filename, document_hash, keywords, similarity, originality, ai_score, cache_hit, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (scan_id, filename, doc_hash, json.dumps(keywords),
              similarity, originality, ai_score, cache_hit, now))

        for m in matches:
            conn.execute("""
                INSERT OR IGNORE INTO similarity_matches (scan_id, paper_id, similarity, paragraph)
                VALUES (?, ?, ?, ?)
            """, (scan_id, m["paper_id"], m["similarity"], m.get("paragraph", "")))


# ──────────────────────────────────────────────
#  UTILITY
# ──────────────────────────────────────────────

def get_scan_history(limit: int = 20) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM scans ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def db_stats() -> dict:
    with _connect() as conn:
        papers = conn.execute("SELECT COUNT(*) FROM papers_cache").fetchone()[0]
        scans  = conn.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
        matches= conn.execute("SELECT COUNT(*) FROM similarity_matches").fetchone()[0]
    return {"cached_papers": papers, "total_scans": scans, "total_matches": matches}
