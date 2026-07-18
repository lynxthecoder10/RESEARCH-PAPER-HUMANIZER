from app.services.ai_risk import estimate_ai_risk


def test_short_text_warning():
    doc = "This is too short."
    result = estimate_ai_risk(doc)
    assert result["risk_score"] == 0
    assert result["risk_level"] == "low"
    assert "too short" in result["limitations"][1]


def test_repetitive_uniform_text():
    # Generate 15 identical sentences of 10 words each (total 150 words) to trigger uniformity
    sentence = "This is a very uniform and repetitive sentence structure exactly. "
    doc = sentence * 15
    result = estimate_ai_risk(doc)
    # Uniform text -> low variance -> higher AI risk score
    assert (
        result["risk_score"] > 30
    )  # At least medium/high depending on exact thresholds
    assert 0 <= result["risk_score"] <= 100
    assert result["risk_level"] in ["medium", "high"]


def test_varied_human_style_text():
    doc = """
    This is a short sentence. However, this following sentence is considerably longer and introduces much more complex vocabulary to demonstrate variety. 
    A question? Why yes, another short burst. 
    Finally, this concluding paragraph adds even more lexical diversity and structural variation to the overall document, proving that it is likely human. 
    It has a mix of long, short, and medium phrases. It also uses words like juxtaposition, paradigm, and heuristic.
    This should be enough words if we repeat a bit to hit the 100 word minimum. Let's keep writing to ensure we pass the threshold.
    The sun is shining brightly today. Quantum mechanics is fascinating. Biology is the study of life. 
    We need just a few more words to reach the one hundred word limit for the AI risk estimator to run properly. 
    Here are the final words to conclude this varied text block.
    """
    result = estimate_ai_risk(doc)
    assert 0 <= result["risk_score"] <= 100
    # Should have higher variance, leading to lower risk score
    assert result["risk_level"] in ["low", "medium"]


def test_mandatory_limitation():
    doc = "A" * 500  # Just some long text
    # need words
    doc = "word " * 120
    result = estimate_ai_risk(doc)
    assert any(
        "statistical risk estimate and cannot prove AI authorship" in lim
        for lim in result["limitations"]
    )
