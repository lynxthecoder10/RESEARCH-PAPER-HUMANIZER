import re
from typing import Dict, Any
import statistics


def estimate_ai_risk(document_text: str) -> Dict[str, Any]:
    """
    Estimate AI content risk using lightweight statistical indicators.
    This is not definitive proof of AI authorship.
    """
    words = document_text.split()
    if len(words) < 100:
        return {
            "risk_score": 0,
            "risk_level": "low",
            "signals": [],
            "limitations": [
                "This is a statistical risk estimate and cannot prove AI authorship.",
                "The text is too short for a reliable AI risk estimation.",
            ],
        }

    sentences = re.split(r"(?<=[.!?])\s+", document_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 3]

    if len(sentences) < 5:
        return {
            "risk_score": 0,
            "risk_level": "low",
            "signals": [],
            "limitations": [
                "This is a statistical risk estimate and cannot prove AI authorship.",
                "Insufficient sentence count for variation analysis.",
            ],
        }

    # 1. Sentence length variance
    sentence_lengths = [len(s.split()) for s in sentences]
    mean_length = sum(sentence_lengths) / len(sentence_lengths)

    try:
        variance = statistics.variance(sentence_lengths)
    except statistics.StatisticsError:
        variance = 0.0

    # Human text usually has higher sentence length variance than AI
    # Higher variance -> lower AI risk
    # Normalized roughly
    if mean_length > 0:
        cv = (variance**0.5) / mean_length  # Coefficient of variation
    else:
        cv = 0

    # 2. Vocabulary diversity (Type-Token Ratio)
    unique_words = set(w.lower() for w in words)
    ttr = len(unique_words) / len(words)

    # Simple heuristic scoring:
    # Very uniform sentence length (cv < 0.3) -> +40 risk
    # Moderate uniformity (cv < 0.5) -> +20 risk
    # High uniformity (cv < 0.7) -> +10 risk

    score = 0

    if cv < 0.3:
        score += 50
    elif cv < 0.4:
        score += 30
    elif cv < 0.5:
        score += 15

    # AI models often have higher vocabulary diversity in short bursts, but lower over long texts.
    # TTR < 0.4 for moderate text could indicate repetition or AI
    if ttr < 0.45:
        score += 30
    elif ttr < 0.55:
        score += 15

    # Add a bit of burstiness metric
    # Burstiness measures if word frequencies are bursty or uniform.
    # We will use sentence length standard deviation as a proxy for burstiness here
    burstiness = cv * mean_length
    if burstiness < 5.0:
        score += 20

    score = max(0, min(100, int(score)))

    if score < 35:
        risk_level = "low"
    elif score < 70:
        risk_level = "medium"
    else:
        risk_level = "high"

    signals = [
        {
            "name": "sentence_variation",
            "value": round(cv, 3),
            "interpretation": "Lower values suggest higher uniformity, common in AI-generated text.",
        },
        {
            "name": "lexical_diversity",
            "value": round(ttr, 3),
            "interpretation": "Ratio of unique words to total words.",
        },
        {
            "name": "burstiness",
            "value": round(burstiness, 3),
            "interpretation": "Measures variation in structure length.",
        },
    ]

    return {
        "risk_score": score,
        "risk_level": risk_level,
        "signals": signals,
        "limitations": [
            "This is a statistical risk estimate and cannot prove AI authorship."
        ],
    }
