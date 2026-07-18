import re
from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from app.config import settings


def split_into_paragraphs(text: str) -> List[str]:
    # Split on double newlines or single newlines if they seem like paragraph boundaries
    paras = re.split(r"\n\s*\n", text)
    cleaned_paras = [p.strip() for p in paras if p.strip()]
    return cleaned_paras


def match_paragraphs(
    document_text: str, sources: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    if not document_text or not sources:
        return []

    paragraphs = split_into_paragraphs(document_text)
    matched_results = []

    vectorizer = TfidfVectorizer(stop_words="english", lowercase=True)

    for p_idx, paragraph in enumerate(paragraphs):
        word_count = len(paragraph.split())
        if word_count < settings.PARAGRAPH_MIN_WORDS:
            continue

        best_match = None
        best_score = 0.0

        for source in sources:
            title = source.get("title") or ""
            abstract = source.get("abstract") or ""
            source_text = f"{title} {abstract}".strip()

            if len(source_text.split()) < 5:
                continue

            try:
                tfidf_matrix = vectorizer.fit_transform([paragraph, source_text])
                score = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
            except Exception:
                score = 0.0

            score = max(0.0, min(1.0, float(score)))

            if score > best_score and score >= settings.SIMILARITY_MATCH_THRESHOLD:
                best_score = score
                best_match = {
                    "source_id": source.get("provider_id", ""),
                    "source_title": title,
                    "matched_excerpt": source_text[:300]
                    + ("..." if len(source_text) > 300 else ""),
                }

        if best_match:
            # We have a valid match over the threshold
            # Make sure we don't exceed max matches just in case
            if len(matched_results) >= settings.MAX_MATCHED_PARAGRAPHS:
                break

            matched_results.append(
                {
                    "paragraph_index": p_idx,
                    "document_excerpt": paragraph[:300]
                    + ("..." if len(paragraph) > 300 else ""),
                    "source_id": best_match["source_id"],
                    "source_title": best_match["source_title"],
                    "matched_excerpt": best_match["matched_excerpt"],
                    "similarity_score": best_score,
                    "paragraph_word_count": word_count,  # Used for aggregation
                }
            )

    # Sort matches by paragraph index
    matched_results.sort(key=lambda x: x["paragraph_index"])
    return matched_results
