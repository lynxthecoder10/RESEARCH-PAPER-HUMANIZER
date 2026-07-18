import re
from collections import Counter
from typing import List, Dict


STOP_WORDS = {
    "the", "and", "of", "in", "to", "a", "for", "with", "on",
    "by", "an", "or", "as", "at", "from", "is", "are", "was",
    "were", "be", "been", "being", "it", "its", "that", "this",
    "these", "those", "which", "who", "whom", "their", "they", "them",
    "he", "she", "him", "her", "we", "us", "our", "you", "your",
    "i", "me", "my", "mine", "has", "have", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might",
    "shall", "can", "but", "if", "not", "no", "so", "very",
    "just", "about", "also", "than", "then", "such", "when",
    "what", "how", "all", "each", "every", "both", "few",
    "more", "most", "other", "some", "any", "only", "into",
    "over", "after", "before", "between", "through", "during",
    "without", "within", "along", "among", "however", "while",
    "where", "there", "here", "out", "up", "down", "off",
    # Reference-section noise words
    "vol", "pp", "doi", "isbn", "issn", "retrieved", "accessed",
    "http", "https", "www", "com", "org", "edu", "pdf", "journal",
    "press", "publisher", "edition", "chapter", "editors",
}


def extract_keywords(
    text: str, min_keywords: int = 8, max_keywords: int = 15
) -> List[str]:
    """Deterministically extract ranked keywords from text.

    Algorithm:
    1. Lowercase the text, replace non-alphanumeric characters with spaces.
    2. Tokenise on whitespace.
    3. Remove stop words and tokens shorter than 3 characters.
    4. Remove purely numeric tokens (page numbers, years in references).
    5. Count token frequencies and select the most common ones.
    6. Clamp result length between *min_keywords* and *max_keywords*.

    Returns an ordered list of keywords (most frequent first).
    """
    if not text or not text.strip():
        return []

    cleaned = re.sub(r"[^a-z0-9]+", " ", text.lower())
    tokens = [
        tok
        for tok in cleaned.split()
        if len(tok) >= 3 and tok not in STOP_WORDS and not tok.isdigit()
    ]

    if not tokens:
        return []

    freq = Counter(tokens)
    most_common = [tok for tok, _ in freq.most_common(max_keywords)]

    # Pad with less frequent tokens if we have fewer than min_keywords
    if len(most_common) < min_keywords:
        seen = set(most_common)
        for tok in tokens:
            if tok not in seen:
                most_common.append(tok)
                seen.add(tok)
            if len(most_common) >= min_keywords:
                break

    return most_common[:max_keywords]


def generate_search_queries(keywords: List[str], max_queries: int = 3) -> List[str]:
    """Generate focused search queries from a ranked keyword list.

    Strategy:
    - Query 1: top 4 keywords joined (broad).
    - Query 2: next 3–4 keywords joined (secondary topic).
    - Query 3: first 2 + last 2 keywords (cross-topic).

    Returns 2–3 query strings.  If fewer than 4 keywords are available,
    returns a single query of all keywords.
    """
    if not keywords:
        return []

    if len(keywords) < 4:
        return [" ".join(keywords)]

    queries: List[str] = []

    # Query 1: top 4 keywords
    queries.append(" ".join(keywords[:4]))

    # Query 2: next slice (keywords 4–7)
    if len(keywords) > 4:
        end = min(8, len(keywords))
        queries.append(" ".join(keywords[4:end]))

    # Query 3: cross-topic (first 2 + last 2)
    if len(keywords) >= 6 and max_queries >= 3:
        cross = keywords[:2] + keywords[-2:]
        q3 = " ".join(cross)
        if q3 not in queries:
            queries.append(q3)

    return queries[:max_queries]
