from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def calculate_similarity(
    document_text: str, sources: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Compare the uploaded cleaned document against each candidate source using TF-IDF and cosine similarity.
    Returns a list of dictionaries with per-source values.
    """
    if not document_text or not document_text.strip():
        return []

    results = []

    # We create a new vectorizer for this comparison context
    vectorizer = TfidfVectorizer(
        stop_words="english",
        lowercase=True,
        min_df=1,
    )

    for source in sources:
        # Combine title and abstract for comparison
        title = source.get("title") or ""
        abstract = source.get("abstract") or ""
        source_text = f"{title} {abstract}".strip()

        # Safe-guard against empty abstracts/titles
        if not source_text or len(source_text.split()) < 5:
            # Too short to compare meaningfully, default to 0
            results.append(
                {
                    "source_id": source.get("provider_id", ""),
                    "title": title,
                    "similarity_score": 0.0,
                    "matched_paragraph_count": 0,
                }
            )
            continue

        try:
            tfidf_matrix = vectorizer.fit_transform([document_text, source_text])
            score = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        except Exception:
            score = 0.0

        # Ensure score remains strictly between 0 and 1
        score = max(0.0, min(1.0, float(score)))

        results.append(
            {
                "source_id": source.get("provider_id", ""),
                "title": title,
                "similarity_score": score,
                "matched_paragraph_count": 0,  # This will be updated by the paragraph matcher later
            }
        )

    return results
