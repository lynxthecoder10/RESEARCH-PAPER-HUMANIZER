from app.services.similarity import calculate_similarity


def test_identical_text_similarity():
    doc = "This is a very specific test sentence about machine learning and natural language processing."
    sources = [
        {
            "provider_id": "test1",
            "title": "Machine Learning",
            "abstract": "This is a very specific test sentence about machine learning and natural language processing.",
        }
    ]
    results = calculate_similarity(doc, sources)
    assert len(results) == 1
    assert results[0]["similarity_score"] > 0.9
    assert results[0]["similarity_score"] <= 1.0


def test_unrelated_text_similarity():
    doc = "Apples are delicious fruits."
    sources = [
        {
            "provider_id": "test1",
            "title": "Quantum Physics",
            "abstract": "The behavior of subatomic particles is very complex.",
        }
    ]
    results = calculate_similarity(doc, sources)
    assert len(results) == 1
    assert results[0]["similarity_score"] < 0.1


def test_empty_abstract():
    doc = "Some text"
    sources = [{"provider_id": "test1", "title": "", "abstract": ""}]
    results = calculate_similarity(doc, sources)
    assert len(results) == 1
    assert results[0]["similarity_score"] == 0.0


def test_score_range():
    doc = "A somewhat matching text."
    sources = [
        {
            "provider_id": "test1",
            "title": "Matching",
            "abstract": "A somewhat matching text that has a few extra words.",
        }
    ]
    results = calculate_similarity(doc, sources)
    assert 0.0 <= results[0]["similarity_score"] <= 1.0
