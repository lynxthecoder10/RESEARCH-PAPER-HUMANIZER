from pydantic_settings import BaseSettings
import os

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

settings = Settings()
