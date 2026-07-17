import hashlib

def generate_document_hash(cleaned_text: str) -> str:
    """Generate SHA-256 hash of the cleaned and normalized document text.
    """
    normalized_utf8 = cleaned_text.encode("utf-8")
    hasher = hashlib.sha256(normalized_utf8)
    return hasher.hexdigest().lower()
