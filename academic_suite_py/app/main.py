import logging
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from app.config import settings
from app.logger import logger
from middleware.auth_middleware import verify_jwt_token
from middleware.exception_handler import register_exception_handlers

app = FastAPI(title="Academic Suite Backend", version="0.1.0")

# Register global exception handlers
register_exception_handlers(app)

# Protected test endpoint
@app.get("/api/protected")
async def protected_endpoint(request: Request, payload: dict = Depends(verify_jwt_token)):
    """Return the JWT payload for a verified request.

    This endpoint is used to confirm that Supabase JWT verification works.
    """
    return {"message": "Access granted", "user": payload}

# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Include routers placeholder (future modules will be added here)
# from auth import router as auth_router
# app.include_router(auth_router, prefix="/api/auth")
