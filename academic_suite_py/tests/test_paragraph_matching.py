from app.services.paragraph_matching import match_paragraphs


def test_short_paragraph_ignored():
    doc = "Too short."
    sources = [{"provider_id": "test1", "title": "Test", "abstract": "Too short."}]
    # Default min words is 20, so this should be ignored
    results = match_paragraphs(doc, sources)
    assert len(results) == 0


def test_meaningful_match_retained():
    doc = (
        "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. "
        "It also shares identical text with the source abstract."
    )
    sources = [
        {
            "provider_id": "test1",
            "title": "Test",
            "abstract": "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. It also shares identical text with the source abstract.",
        }
    ]
    results = match_paragraphs(doc, sources)
    assert len(results) == 1
    assert results[0]["similarity_score"] > 0.8
    assert len(results[0]["matched_excerpt"]) <= 303  # 300 + "..."


def test_weak_match_ignored():
    doc = "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. But totally unrelated topics."
    sources = [
        {
            "provider_id": "test1",
            "title": "Test",
            "abstract": "Quantum physics and subatomic particles exhibit wave-particle duality and complex behaviors beyond classical mechanics.",
        }
    ]
    results = match_paragraphs(doc, sources)
    assert len(results) == 0


def test_strongest_source_retained():
    doc = "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. It matches source 2 exactly."
    sources = [
        {
            "provider_id": "test1",
            "title": "Test 1",
            "abstract": "This is a sufficiently long paragraph that contains enough words but diverges at the end completely.",
        },
        {
            "provider_id": "test2",
            "title": "Test 2",
            "abstract": "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. It matches source 2 exactly.",
        },
    ]
    results = match_paragraphs(doc, sources)
    assert len(results) == 1
    assert results[0]["source_id"] == "test2"
