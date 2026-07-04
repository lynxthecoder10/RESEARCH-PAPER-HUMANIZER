"""
Academic Suite — Plagiarism Checker
Document extraction: PDF / DOCX / TXT → clean text + SHA-256 hash.
"""

import hashlib
import re
import os


# ──────────────────────────────────────────────
#  EXTRACTION
# ──────────────────────────────────────────────

def extract_text(filepath: str) -> str:
    """
    Dispatch to the correct extractor based on file extension.
    Returns raw extracted text.
    """
    ext = os.path.splitext(filepath)[1].lower()
    extractors = {
        ".pdf":  _extract_pdf,
        ".docx": _extract_docx,
        ".txt":  _extract_txt,
        ".md":   _extract_txt,
        ".tex":  _extract_txt,
        ".rst":  _extract_txt,
    }
    fn = extractors.get(ext)
    if fn is None:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(extractors)}")
    return fn(filepath)


def _extract_pdf(path: str) -> str:
    try:
        import pdfplumber
        pages = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
        return "\n".join(pages)
    except ImportError:
        raise ImportError(
            "pdfplumber not installed. Run: pip install pdfplumber"
        )


def _extract_docx(path: str) -> str:
    try:
        from docx import Document
        doc = Document(path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except ImportError:
        raise ImportError(
            "python-docx not installed. Run: pip install python-docx"
        )


def _extract_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


# ──────────────────────────────────────────────
#  CLEANING
# ──────────────────────────────────────────────

def clean_text(text: str) -> str:
    """
    Normalize extracted text for NLP processing.
    - Collapse whitespace
    - Remove control characters
    - Normalize unicode dashes and quotes
    - Preserve sentence boundaries
    """
    # Normalize unicode quotes and dashes
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2013", "-").replace("\u2014", "-")

    # Remove non-printable control characters (keep newlines)
    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E\x80-\xFF]", " ", text)

    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse multiple spaces
    text = re.sub(r"[ \t]+", " ", text)

    return text.strip()


# ──────────────────────────────────────────────
#  HASHING
# ──────────────────────────────────────────────

def sha256_hash(text: str) -> str:
    """Generate a SHA-256 fingerprint of the document text."""
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


# ──────────────────────────────────────────────
#  PARAGRAPH SEGMENTATION
# ──────────────────────────────────────────────

def split_paragraphs(text: str, min_words: int = 20) -> list[str]:
    """
    Split document into meaningful paragraphs for sentence-level matching.
    Filters out very short fragments.
    """
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return [p for p in paras if len(p.split()) >= min_words]


# ──────────────────────────────────────────────
#  COMBINED PIPELINE
# ──────────────────────────────────────────────

def process_file(filepath: str) -> dict:
    """
    Full extraction pipeline for a single file.

    Returns:
        {
            "raw_text":   str,
            "clean_text": str,
            "hash":       str (SHA-256),
            "paragraphs": list[str],
            "word_count": int,
            "filename":   str,
        }
    """
    raw   = extract_text(filepath)
    clean = clean_text(raw)
    return {
        "raw_text":   raw,
        "clean_text": clean,
        "hash":       sha256_hash(clean),
        "paragraphs": split_paragraphs(clean),
        "word_count": len(clean.split()),
        "filename":   os.path.basename(filepath),
    }


def process_text(text: str, label: str = "pasted_text") -> dict:
    """Same pipeline for raw pasted text (no file extraction needed)."""
    clean = clean_text(text)
    return {
        "raw_text":   text,
        "clean_text": clean,
        "hash":       sha256_hash(clean),
        "paragraphs": split_paragraphs(clean),
        "word_count": len(clean.split()),
        "filename":   label,
    }
