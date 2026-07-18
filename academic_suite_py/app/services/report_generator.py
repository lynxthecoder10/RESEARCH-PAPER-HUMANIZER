import datetime
from typing import Dict, Any, List


def generate_report(
    scan_id: str,
    document_word_count: int,
    matched_paragraphs: List[Dict[str, Any]],
    ai_risk_data: Dict[str, Any],
    sources: List[Dict[str, Any]],
    search_mode: str,
    cache_stats: Dict[str, Any],
) -> Dict[str, Any]:

    # Similarity Aggregation
    # 1. For each document paragraph, keep only its strongest valid source match.
    # (The paragraph_matching service already keeps the strongest match per paragraph)

    total_matched_words = 0
    weighted_matched_words = 0.0

    for match in matched_paragraphs:
        word_count = match.get("paragraph_word_count", 0)
        score = match.get("similarity_score", 0.0)

        total_matched_words += word_count
        weighted_matched_words += word_count * score

    # Divide weighted matched words by total eligible document words.
    if document_word_count > 0:
        raw_sim_percentage = (weighted_matched_words / document_word_count) * 100.0
    else:
        raw_sim_percentage = 0.0

    similarity_percentage = max(0.0, min(100.0, round(raw_sim_percentage, 1)))
    originality_percentage = round(100.0 - similarity_percentage, 1)

    # Risk Labels
    if similarity_percentage < 15:
        similarity_risk = "Low"
    elif similarity_percentage < 40:
        similarity_risk = "Moderate"
    else:
        similarity_risk = "High"

    # Recommendations
    recommendations = []
    if similarity_risk in ["Moderate", "High"]:
        recommendations.append("Review highly similar paragraphs carefully.")
        recommendations.append("Verify citations and add attribution where required.")

    if ai_risk_data.get("risk_level") in ["medium", "high"]:
        recommendations.append("Manually review AI-risk signals.")

    if search_mode == "offline":
        recommendations.append(
            "Rerun against live scholarly providers when enabled for exhaustive checking."
        )

    # Limitations
    limitations = []
    if search_mode == "offline":
        limitations.extend(
            [
                "Live scholarly retrieval is disabled.",
                "Results are based on the bundled synthetic demonstration corpus.",
                "The result is not an exhaustive internet-wide plagiarism check.",
            ]
        )
    limitations.extend(ai_risk_data.get("limitations", []))

    report = {
        "scan_id": scan_id,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "search_mode": search_mode,
        "similarity_percentage": similarity_percentage,
        "originality_percentage": originality_percentage,
        "similarity_risk_level": similarity_risk,
        "ai_content_risk": ai_risk_data,
        "matched_sources": sources,
        "matched_paragraphs": matched_paragraphs,
        "cache_statistics": cache_stats,
        "limitations": list(set(limitations)),  # unique
        "recommendations": recommendations,
        "metadata": {
            "document_word_count": document_word_count,
            "matched_word_coverage": total_matched_words,
            "matched_paragraph_count": len(matched_paragraphs),
            "source_count": len(sources),
        },
    }

    return report
