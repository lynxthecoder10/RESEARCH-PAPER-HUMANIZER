from app.services.report_generator import generate_report


def test_report_generation():
    scan_id = "test-scan-123"
    document_word_count = 1000
    matched_paragraphs = [
        {"paragraph_index": 0, "paragraph_word_count": 100, "similarity_score": 0.8},
        {"paragraph_index": 1, "paragraph_word_count": 50, "similarity_score": 1.0},
    ]
    ai_risk_data = {
        "risk_score": 60,
        "risk_level": "medium",
        "limitations": ["Statistical estimate only."],
    }
    sources = [{"provider_id": "test1"}]
    cache_stats = {"hits": 0, "misses": 1}

    report = generate_report(
        scan_id=scan_id,
        document_word_count=document_word_count,
        matched_paragraphs=matched_paragraphs,
        ai_risk_data=ai_risk_data,
        sources=sources,
        search_mode="offline",
        cache_stats=cache_stats,
    )

    # Weighted score = (100 * 0.8) + (50 * 1.0) = 80 + 50 = 130
    # Sim % = 130 / 1000 = 0.13 = 13.0%
    assert report["similarity_percentage"] == 13.0
    assert report["originality_percentage"] == 87.0
    assert report["similarity_risk_level"] == "Low"
    assert "Live scholarly retrieval is disabled." in report["limitations"]
    assert (
        "Review highly similar paragraphs carefully." not in report["recommendations"]
    )  # Because it's low risk
    assert "Manually review AI-risk signals." in report["recommendations"]
