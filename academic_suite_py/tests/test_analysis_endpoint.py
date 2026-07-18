import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.db import initialize_database

# Ensure loop is set
asyncio.set_event_loop(asyncio.new_event_loop())
client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(initialize_database())


def test_unknown_scan_returns_404():
    headers = {"Authorization": "Bearer mock-user"}
    resp = client.post("/api/v1/scans/invalid-id-123/analyze", headers=headers)
    assert resp.status_code == 404


def test_successful_analysis():
    headers = {"Authorization": "Bearer mock-user"}
    # First ingest some text
    doc_text = (
        "This is a sufficiently long paragraph that contains enough words to exceed the minimum threshold for paragraph matching. "
        "It also shares identical text with the source abstract. "
        "We are adding some more words here to ensure that it meets all minimum thresholds for ai risk estimation. "
        "The quick brown fox jumps over the lazy dog and the machine learning model learns from the data."
        "Quantum computing is also a very interesting topic that we could discuss."
        "But let us keep going until we have about a hundred words or so to be totally safe for the AI estimation."
        "Machine learning is basically statistics applied to large datasets using algorithms. "
        "Deep learning is a subset of machine learning using neural networks. "
        "AI risk is a thing to measure carefully. "
        "Here are more words to increase the count for the test. "
        "Still writing words. Data science. Big data. Analytics. "
    )
    ingest_resp = client.post(
        "/api/v1/documents/extract", data={"pasted_text": doc_text}, headers=headers
    )
    assert ingest_resp.status_code == 200
    scan_id = ingest_resp.json()["scan_id"]

    # Run analysis
    analyze_resp = client.post(f"/api/v1/scans/{scan_id}/analyze", headers=headers)
    assert analyze_resp.status_code == 200
    data = analyze_resp.json()
    assert data["scan_id"] == scan_id
    assert "report" in data
    assert "similarity_percentage" in data["report"]
    assert "matched_sources" in data["report"]

    # Repeated request should hit cache
    analyze_resp_2 = client.post(f"/api/v1/scans/{scan_id}/analyze", headers=headers)
    assert analyze_resp_2.status_code == 200
    assert analyze_resp_2.json()["cache_hit"] == True

    # Test GET report endpoint
    get_resp = client.get(f"/api/v1/scans/{scan_id}/report", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["cache_hit"] == True
    assert get_resp.json()["report"]["scan_id"] == scan_id


def test_get_unknown_report_returns_404():
    headers = {"Authorization": "Bearer mock-user"}
    resp = client.get("/api/v1/scans/invalid-id-456/report", headers=headers)
    assert resp.status_code == 404
