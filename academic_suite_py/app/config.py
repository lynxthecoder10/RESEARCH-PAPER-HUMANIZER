from pydantic_settings import BaseSettings
import os
from pathlib import Path

# Resolve project root directory (parent of app/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Core settings
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_JWT_PUBLIC_KEY_URL: str = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")
    JWT_AUDIENCE: str = os.getenv("JWT_AUDIENCE", "authenticated")
    JWT_ISSUER: str = f"{SUPABASE_URL}/auth/v1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    # Cache TTL settings (in seconds)
    # Document extraction cache TTL (default 7 days)
    DOCUMENT_CACHE_TTL_SECONDS: int = int(
        os.getenv("DOCUMENT_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60))
    )
    # API query cache TTL (default 24 hours)
    API_CACHE_TTL_SECONDS: int = int(
        os.getenv("API_CACHE_TTL_SECONDS", str(24 * 60 * 60))
    )
    # Paper metadata cache TTL (default 7 days)
    PAPER_METADATA_CACHE_TTL_SECONDS: int = int(
        os.getenv("PAPER_METADATA_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60))
    )
    # Search cache TTL (default 24 hours)
    SEARCH_CACHE_TTL_SECONDS: int = int(
        os.getenv("SEARCH_CACHE_TTL_SECONDS", str(24 * 60 * 60))
    )
    # Search mode (offline or online)
    SCHOLARLY_SEARCH_MODE: str = os.getenv("SCHOLARLY_SEARCH_MODE", "offline")
    # Offline source corpus path (resolved relative to project root)
    OFFLINE_SOURCE_PATH: str = os.getenv(
        "OFFLINE_SOURCE_PATH",
        str(_PROJECT_ROOT / "data" / "demo_scholarly_sources.json"),
    )

    # Similarity thresholds
    SIMILARITY_MATCH_THRESHOLD: float = float(
        os.getenv("SIMILARITY_MATCH_THRESHOLD", "0.30")
    )
    PARAGRAPH_MIN_WORDS: int = int(os.getenv("PARAGRAPH_MIN_WORDS", "20"))
    MAX_MATCHED_PARAGRAPHS: int = int(os.getenv("MAX_MATCHED_PARAGRAPHS", "20"))

    # Report caching
    ANALYSIS_VERSION: str = os.getenv("ANALYSIS_VERSION", "v1")
    REPORT_CACHE_TTL_SECONDS: int = int(
        os.getenv("REPORT_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60))
    )


settings = Settings()
