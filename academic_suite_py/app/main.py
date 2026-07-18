from datetime import datetime, timezone, timedelta

from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Request, File, UploadFile, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.config import settings
from app.logger import logger
from middleware.auth_middleware import verify_jwt_token
from middleware.exception_handler import register_exception_handlers
from app.services.extraction import (
    extract_document,
    extract_pasted_text,
    IngestionError,
)
from app.services.cleaning import clean_and_normalize_text
from app.services.hashing import generate_document_hash
from app.services.keywords import extract_keywords, generate_search_queries
from app.services.offline_source_provider import OfflineSourceProvider
from app.services.source_deduplication import deduplicate_sources
from app.services.search_cache import SearchCache
from app.db import (
    initialize_database,
    get_scan_by_hash,
    create_scan,
    get_scan_by_id,
    create_scan_source,
)

app = FastAPI(title="Academic Suite Backend", version="0.1.0")

# Register global exception handlers
register_exception_handlers(app)


@app.on_event("startup")
async def on_startup():
    try:
        await initialize_database()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error("Failed to initialize database during startup", exc_info=e)


# Protected test endpoint
@app.get("/api/protected")
async def protected_endpoint(
    request: Request, payload: dict = Depends(verify_jwt_token)
):
    """Return the JWT payload for a verified request.
    This endpoint is used to confirm that Supabase JWT verification works.
    """
    return {"message": "Access granted", "user": payload}


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Ingestion / Extraction Endpoint
@app.post("/api/v1/documents/extract")
async def extract_document_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
    pasted_text: Optional[str] = Form(None),
    payload: dict = Depends(verify_jwt_token),
):
    try:
        # Validate inputs
        if file is None and pasted_text is None:
            raise IngestionError(
                "VALIDATION_ERROR", "Either file or pasted_text must be provided.", 400
            )
        if file is not None and pasted_text is not None:
            raise IngestionError(
                "VALIDATION_ERROR", "Provide either file or pasted_text, not both.", 400
            )

        user_id = payload.get("sub") or payload.get("userId")

        if pasted_text is not None:
            # Pasted text flow
            extraction = extract_pasted_text(pasted_text)
        else:
            # File upload flow
            content = await file.read()
            extraction = extract_document(file.filename, content)

        # Clean and normalize text
        cleaned = clean_and_normalize_text(extraction["raw_text"])

        # Verify text is not empty or too short after cleaning
        if not cleaned["cleaned_text"] or cleaned["word_count"] == 0:
            raise IngestionError(
                "NO_EXTRACTABLE_TEXT", "The document contains no extractable text.", 422
            )

        # Generate SHA-256 hash
        doc_hash = generate_document_hash(cleaned["cleaned_text"])

        # Check database for existing hash
        existing_scan = await get_scan_by_hash(doc_hash)

        # Build text preview
        preview = cleaned["cleaned_text"][:240].replace("\n", " ").strip()

        if existing_scan:
            # Verify that the stored cleaned_text matches the current cleaned text to avoid false cache hits
            if existing_scan.cleaned_text == cleaned["cleaned_text"]:
                # Use configurable TTL for document cache (default 7 days)
                ttl_seconds = settings.DOCUMENT_CACHE_TTL_SECONDS
                # Current time in UTC (timezone-aware)
                current_time = datetime.now(timezone.utc)
                # Ensure existing_scan.created_at is timezone-aware
                created_at = existing_scan.created_at
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                expiry_time = created_at + timedelta(seconds=ttl_seconds)
                if current_time <= expiry_time:
                    return {
                        "scan_id": existing_scan.id,
                        "cache_hit": True,
                        "document": {
                            "filename": existing_scan.filename or "pasted_text.txt",
                            "file_type": existing_scan.file_type,
                            "mime_type": existing_scan.mime_type,
                            "page_count": extraction["page_count"],
                            "character_count": existing_scan.character_count,
                            "word_count": existing_scan.word_count,
                            "paragraph_count": cleaned["paragraph_count"],
                            "document_hash": doc_hash,
                            "text_preview": preview,
                        },
                        "warnings": extraction["warnings"],
                    }
            # If cleaned text differs, treat as a new document (ignore cache)

        new_scan = await create_scan(
            user_id=user_id,
            filename=extraction["filename"],
            file_type=extraction["source_type"],
            mime_type=extraction["mime_type"],
            document_hash=doc_hash,
            original_text=extraction["raw_text"],
            cleaned_text=cleaned["cleaned_text"],
            character_count=cleaned["character_count"],
            word_count=cleaned["word_count"],
            status="pending",
        )

        return {
            "scan_id": new_scan.id,
            "cache_hit": False,
            "document": {
                "filename": new_scan.filename or "pasted_text.txt",
                "file_type": new_scan.file_type,
                "mime_type": new_scan.mime_type,
                "page_count": extraction["page_count"],
                "character_count": new_scan.character_count,
                "word_count": new_scan.word_count,
                "paragraph_count": cleaned["paragraph_count"],
                "document_hash": doc_hash,
                "text_preview": preview,
            },
            "warnings": extraction["warnings"],
        }

    except IngestionError as ie:
        return JSONResponse(
            status_code=ie.status_code,
            content={"error": {"code": ie.code, "message": ie.message, "details": {}}},
        )
    except Exception as e:
        logger.error("Unhandled exception during document extraction", exc_info=e)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred during document extraction.",
                    "details": {},
                }
            },
        )


# ------------------------------------------------------------------
# Source Search Endpoint
# ------------------------------------------------------------------

_OFFLINE_LIMITATIONS = [
    "Live scholarly retrieval is currently disabled.",
    "Offline mode uses a bundled synthetic demonstration corpus. "
    "It demonstrates PAGGY's retrieval and comparison workflow but "
    "does not represent live scholarly-database coverage.",
]


class SearchRequest(BaseModel):
    scan_id: str


@app.post("/api/v1/sources/search")
async def search_sources_endpoint(
    body: SearchRequest,
    request: Request,
    payload: dict = Depends(verify_jwt_token),
):
    """Search for scholarly sources matching a previously ingested document."""
    scan_id = body.scan_id

    # 1. Validate scan exists
    scan = await get_scan_by_id(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # 2. Initialize cache (SQLite only in dev — Redis URL checked at runtime)
    redis_url = None
    try:
        if settings.REDIS_URL and "localhost" not in settings.REDIS_URL:
            redis_url = settings.REDIS_URL
    except Exception:
        logger.warning("Failed to initialize Redis URL, falling back to default cache.")

    cache = SearchCache(redis_url=redis_url)
    cache.reset_stats()

    try:
        # 3. Check document-level cache
        doc_cache_key = cache.make_key("doc_sources", scan.document_hash)
        cached_result = await cache.get(doc_cache_key)
        if cached_result:
            cached_result["scan_id"] = scan_id
            cached_result["cache"] = cache.stats
            return cached_result

        # 4. Extract keywords from cleaned text
        keywords = extract_keywords(scan.cleaned_text)
        queries = generate_search_queries(keywords)

        # 5. Search offline sources
        provider = OfflineSourceProvider()
        raw_sources = provider.search(keywords)

        # 6. Deduplicate
        unique_sources = deduplicate_sources(raw_sources)
        dedup_info = {
            "received": len(raw_sources),
            "unique": len(unique_sources),
            "duplicates_removed": len(raw_sources) - len(unique_sources),
        }

        # 7. Persist sources to DB
        for src in unique_sources:
            try:
                await create_scan_source(
                    scan_id=scan_id,
                    provider=src.get("provider", "demo_corpus"),
                    provider_id=src.get("provider_id", ""),
                    title=src.get("title", ""),
                    abstract=src.get("abstract"),
                    authors=src.get("authors"),
                    doi=src.get("doi"),
                    publication_year=src.get("publication_year"),
                    venue=src.get("venue"),
                    source_url=src.get("url"),
                    citation_count=src.get("citation_count"),
                )
            except Exception as exc:
                logger.warning(
                    "Failed to persist source %s: %s", src.get("provider_id"), exc
                )

        # 8. Build safe response sources (no filesystem paths, no secrets)
        response_sources = []
        for src in unique_sources:
            response_sources.append(
                {
                    "provider": src.get("provider"),
                    "provider_id": src.get("provider_id"),
                    "title": src.get("title"),
                    "authors": src.get("authors", []),
                    "publication_year": src.get("publication_year"),
                    "venue": src.get("venue"),
                    "candidate_score": src.get("candidate_score", 0.0),
                }
            )

        result = {
            "scan_id": scan_id,
            "mode": "offline",
            "keywords": keywords,
            "search_queries": queries,
            "sources": response_sources,
            "deduplication": dedup_info,
            "cache": cache.stats,
            "limitations": _OFFLINE_LIMITATIONS,
        }

        # 9. Cache the result for future requests
        try:
            await cache.set(
                doc_cache_key, result, ttl=settings.SEARCH_CACHE_TTL_SECONDS
            )
        except Exception as exc:
            logger.warning("Failed to cache search result: %s", exc)

        # Update cache stats after the write
        result["cache"] = cache.stats

        return result

    except FileNotFoundError as exc:
        logger.error("Corpus file error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "CORPUS_NOT_FOUND",
                    "message": "The offline demonstration corpus could not be loaded.",
                    "details": {},
                }
            },
        )
    except Exception as exc:
        logger.error("Unhandled exception during source search", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred during source search.",
                    "details": {},
                }
            },
        )
