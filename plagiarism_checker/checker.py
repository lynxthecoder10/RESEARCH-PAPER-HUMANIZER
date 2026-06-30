"""
Academic Suite — Python Plagiarism Checker
Core detection engine using 4 independent algorithms.
"""

import re
import math
import hashlib
from collections import Counter
from difflib import SequenceMatcher


# ──────────────────────────────────────────────
#  TEXT PREPROCESSING
# ──────────────────────────────────────────────

def preprocess(text: str) -> str:
    """Lowercase, strip punctuation, normalize whitespace."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> list[str]:
    return preprocess(text).split()


def get_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 10]


# ──────────────────────────────────────────────
#  ALGORITHM 1: TF-IDF COSINE SIMILARITY
# ──────────────────────────────────────────────

def _tfidf_vector(tokens: list[str], vocab: set) -> dict:
    tf = Counter(tokens)
    total = len(tokens) or 1
    return {word: tf[word] / total for word in vocab if word in tf}


def cosine_similarity(vec_a: dict, vec_b: dict) -> float:
    common = set(vec_a) & set(vec_b)
    if not common:
        return 0.0
    dot = sum(vec_a[w] * vec_b[w] for w in common)
    mag_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
    mag_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))
    return dot / (mag_a * mag_b) if (mag_a and mag_b) else 0.0


def tfidf_similarity(text_a: str, text_b: str) -> float:
    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)
    vocab = set(tokens_a) | set(tokens_b)
    vec_a = _tfidf_vector(tokens_a, vocab)
    vec_b = _tfidf_vector(tokens_b, vocab)
    return cosine_similarity(vec_a, vec_b)


# ──────────────────────────────────────────────
#  ALGORITHM 2: N-GRAM FINGERPRINTING (JACCARD)
# ──────────────────────────────────────────────

def _ngrams(tokens: list[str], n: int) -> set:
    return {" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def ngram_similarity(text_a: str, text_b: str, n: int = 3) -> float:
    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)
    grams_a = _ngrams(tokens_a, n)
    grams_b = _ngrams(tokens_b, n)
    if not grams_a or not grams_b:
        return 0.0
    intersection = len(grams_a & grams_b)
    union = len(grams_a | grams_b)
    return intersection / union if union else 0.0


# ──────────────────────────────────────────────
#  ALGORITHM 3: SEQUENCE MATCHING (LCS-BASED)
# ──────────────────────────────────────────────

def sequence_similarity(text_a: str, text_b: str) -> float:
    a = preprocess(text_a)
    b = preprocess(text_b)
    return SequenceMatcher(None, a, b).ratio()


# ──────────────────────────────────────────────
#  ALGORITHM 4: WINNOWING / HASH FINGERPRINTING
# ──────────────────────────────────────────────

def _hash_ngram(ngram: str) -> int:
    return int(hashlib.md5(ngram.encode()).hexdigest(), 16) % (10 ** 8)


def _winnow(tokens: list[str], k: int = 5, w: int = 4) -> set:
    """Winnowing algorithm — selects minimum hash in each sliding window."""
    grams = [" ".join(tokens[i : i + k]) for i in range(len(tokens) - k + 1)]
    hashes = [_hash_ngram(g) for g in grams]
    fingerprints = set()
    for i in range(len(hashes) - w + 1):
        window = hashes[i : i + w]
        fingerprints.add(min(window))
    return fingerprints


def winnow_similarity(text_a: str, text_b: str) -> float:
    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)
    if len(tokens_a) < 5 or len(tokens_b) < 5:
        return sequence_similarity(text_a, text_b)
    fp_a = _winnow(tokens_a)
    fp_b = _winnow(tokens_b)
    if not fp_a or not fp_b:
        return 0.0
    shared = len(fp_a & fp_b)
    return shared / max(len(fp_a), len(fp_b))


# ──────────────────────────────────────────────
#  SENTENCE-LEVEL MATCH DETECTION
# ──────────────────────────────────────────────

def find_matching_passages(text_a: str, text_b: str, threshold: float = 0.75) -> list[dict]:
    """Find individual sentences that are suspiciously similar."""
    sentences_a = get_sentences(text_a)
    sentences_b = get_sentences(text_b)
    matches = []

    for sa in sentences_a:
        for sb in sentences_b:
            score = sequence_similarity(sa, sb)
            if score >= threshold:
                matches.append({
                    "source_sentence": sa.strip(),
                    "matched_sentence": sb.strip(),
                    "similarity": round(score * 100, 1),
                })
    return matches


# ──────────────────────────────────────────────
#  MASTER ANALYSIS FUNCTION
# ──────────────────────────────────────────────

def analyze(text_a: str, text_b: str, label_a: str = "Document A", label_b: str = "Document B") -> dict:
    """
    Run all 4 algorithms and return a unified result dict.
    """
    scores = {
        "tfidf_cosine":   round(tfidf_similarity(text_a, text_b) * 100, 2),
        "ngram_jaccard":  round(ngram_similarity(text_a, text_b, n=3) * 100, 2),
        "sequence_match": round(sequence_similarity(text_a, text_b) * 100, 2),
        "winnowing":      round(winnow_similarity(text_a, text_b) * 100, 2),
    }

    # Weighted composite score
    composite = (
        scores["tfidf_cosine"]   * 0.35 +
        scores["ngram_jaccard"]  * 0.30 +
        scores["sequence_match"] * 0.20 +
        scores["winnowing"]      * 0.15
    )
    composite = round(composite, 2)

    # Risk classification
    if composite >= 75:
        risk = "HIGH"
    elif composite >= 45:
        risk = "MEDIUM"
    elif composite >= 20:
        risk = "LOW"
    else:
        risk = "NONE"

    matching_passages = find_matching_passages(text_a, text_b)

    return {
        "label_a": label_a,
        "label_b": label_b,
        "scores": scores,
        "composite_score": composite,
        "risk_level": risk,
        "matching_passages": matching_passages,
        "word_count_a": len(tokenize(text_a)),
        "word_count_b": len(tokenize(text_b)),
    }


def analyze_multi(source_text: str, documents: list[dict], source_label: str = "Source") -> list[dict]:
    """
    Compare source_text against multiple documents.
    documents: list of {"label": str, "text": str}
    """
    results = []
    for doc in documents:
        result = analyze(source_text, doc["text"], source_label, doc.get("label", "Document"))
        results.append(result)
    return sorted(results, key=lambda r: r["composite_score"], reverse=True)
