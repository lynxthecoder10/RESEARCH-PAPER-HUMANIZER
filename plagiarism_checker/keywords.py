"""
Academic Suite — Plagiarism Checker
Keyword extraction using TF-IDF scoring over the document.
Zero external NLP dependencies — pure Python stdlib.
"""

import re
import math
from collections import Counter

# ──────────────────────────────────────────────
#  STOPWORDS (academic English)
# ──────────────────────────────────────────────

STOPWORDS = {
    "a","about","above","after","again","against","all","also","an","and","any",
    "are","as","at","be","because","been","before","being","between","but","by",
    "can","could","did","do","does","doing","down","during","each","few","for",
    "from","further","get","had","has","have","having","he","her","here","him",
    "his","how","if","in","into","is","it","its","itself","just","may","me",
    "might","more","most","much","must","my","no","not","now","of","off","on",
    "only","or","other","our","out","over","own","same","she","should","so",
    "some","such","than","that","the","their","them","then","there","these",
    "they","this","those","through","to","too","under","until","up","very","was",
    "we","were","what","when","where","which","while","who","whom","why","will",
    "with","would","you","your","yours","paper","study","research","results",
    "method","section","figure","table","show","shown","used","using","based",
    "approach","proposed","analysis","new","data","one","two","three","four",
    "also","however","therefore","thus","since","given","various","different",
    "within","without","across","among","between","upon","via","et","al",
    "i","ii","iii","iv","v","use","used","uses",
}


def _tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", " ", text)
    tokens = text.split()
    # Keep tokens 3+ chars, not pure digits, not stopwords
    return [
        t for t in tokens
        if len(t) >= 3
        and not t.isdigit()
        and t not in STOPWORDS
        and not re.match(r"^\d+[\w-]*$", t)  # drop leading-digit tokens
    ]


def _bigrams(tokens: list[str]) -> list[str]:
    """Generate meaningful bigrams from consecutive tokens."""
    return [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens) - 1)]


# ──────────────────────────────────────────────
#  TF-IDF KEYWORD EXTRACTION
# ──────────────────────────────────────────────

def extract_keywords(text: str, top_n: int = 12) -> list[str]:
    """
    Extract top-N keywords from text using TF-IDF on a single document.

    Since we have only one document (not a corpus), we simulate IDF by:
    - Treating each paragraph as a "document"
    - Computing IDF over paragraphs

    This rewards terms that appear in multiple paragraphs but aren't
    so common they're near-stopwords.
    """
    # Segment into paragraphs to use as pseudo-documents for IDF
    paragraphs = [p for p in re.split(r"\n+", text) if len(p.strip()) > 30]
    if len(paragraphs) < 2:
        paragraphs = [text[i:i+200] for i in range(0, len(text), 200)]

    n_docs = len(paragraphs)

    # TF over full document
    all_tokens = _tokenize(text)
    if not all_tokens:
        return []

    tf = Counter(all_tokens)
    total = len(all_tokens)

    # IDF: count how many paragraphs each token appears in
    doc_freq: Counter = Counter()
    for para in paragraphs:
        para_tokens = set(_tokenize(para))
        doc_freq.update(para_tokens)

    # Score = TF * IDF (log-smoothed)
    scores: dict[str, float] = {}
    for token, count in tf.items():
        if doc_freq[token] == 0:
            continue
        idf = math.log((n_docs + 1) / (doc_freq[token] + 1)) + 1.0
        scores[token] = (count / total) * idf

    # Also score bigrams
    bigram_tf = Counter(_bigrams(all_tokens))
    for bigram, count in bigram_tf.items():
        # Simple bigram scoring — reward repeated meaningful phrases
        if count >= 2:
            scores[bigram] = (count / total) * 1.5

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Deduplicate: skip single tokens already covered by a bigram
    final: list[str] = []
    covered_unigrams: set[str] = set()

    for term, _ in ranked:
        if len(final) >= top_n:
            break
        if " " in term:  # bigram
            parts = term.split()
            covered_unigrams.update(parts)
            final.append(term.title())
        elif term not in covered_unigrams:
            final.append(term.title())

    return final


def keywords_to_query(keywords: list[str]) -> str:
    """Convert keyword list to a search query string for external APIs."""
    return " ".join(keywords[:5])  # top 5 is enough for a focused API query
