import unicodedata
import re
from typing import Dict, Any


def clean_and_normalize_text(text: str) -> Dict[str, Any]:
    """Clean and normalize academic text, preserving paragraph structures and citations."""
    if not text:
        return {
            "cleaned_text": "",
            "character_count": 0,
            "word_count": 0,
            "paragraph_count": 0,
        }

    # 1. Normalize Unicode (NFKC handles characters, accents, fractions, compatibility characters)
    text = unicodedata.normalize("NFKC", text)

    # 2. Remove null characters
    text = text.replace("\x00", "")

    # 3. Normalize line endings to LF (\n)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 4. Collapse repeated horizontal spaces (space, tab, etc.) to a single space
    # but do NOT collapse across newlines.
    text = re.sub(r"[ \t]+", " ", text)

    # 5. Trim horizontal whitespace at the start/end of each line
    lines = [line.strip() for line in text.split("\n")]

    # 6. Collapse excessive blank lines (more than 2 newlines) to exactly 2 newlines
    # This preserves paragraph separation while cleaning gaps.
    cleaned_lines = []
    blank_run = 0
    for line in lines:
        if line == "":
            blank_run += 1
            if blank_run <= 1:
                cleaned_lines.append("")
        else:
            blank_run = 0
            cleaned_lines.append(line)

    cleaned_text = "\n".join(cleaned_lines).strip()

    # Calculate metrics
    char_count = len(cleaned_text)
    word_count = len(cleaned_text.split())

    # Paragraph count based on double newlines
    paragraphs = [p for p in cleaned_text.split("\n\n") if p.strip()]
    paragraph_count = len(paragraphs)

    return {
        "cleaned_text": cleaned_text,
        "character_count": char_count,
        "word_count": word_count,
        "paragraph_count": paragraph_count,
    }
