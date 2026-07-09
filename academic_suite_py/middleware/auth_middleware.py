import httpx
from typing import Dict
from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError
from cache.base import CacheBase
from app.config import settings
import logging

logger = logging.getLogger("academic_suite")

async def fetch_jwks() -> Dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(settings.SUPABASE_JWT_PUBLIC_KEY_URL, timeout=10)
        resp.raise_for_status()
        return resp.json()

# Cache the JWKS for the process lifetime (could be extended)
_jwks_cache: Dict = {}

async def get_jwks() -> Dict:
    if not _jwks_cache:
        _jwks_cache.update(await fetch_jwks())
    return _jwks_cache

async def verify_jwt_token(request: Request) -> Dict:
    auth: str = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = auth[7:]
    jwks = await get_jwks()
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header["kid"]
        key = next((k for k in jwks["keys"] if k["kid"] == kid), None)
        if not key:
            raise HTTPException(status_code=401, detail="Invalid token kid")
        payload = jwt.decode(
            token,
            key,
            algorithms=unverified_header["alg"],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
    except JWTError as e:
        logger.error("JWT verification failed", exc_info=e)
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload
