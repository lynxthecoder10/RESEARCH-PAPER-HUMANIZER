from datetime import datetime, timezone, timedelta

from typing import Optional
from sqlalchemy import select
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
from app.db import (
    AsyncSessionLocal,
    initialize_database,
    get_scan_by_hash,
    create_scan,
    get_scan_by_id,
    create_scan_source,
    get_sources_by_scan_id,
    save_scan_matches,
    save_scan_report,
    get_scan_report,
    delete_scan_report,
    Scan,
    ScanReport,
)
from app.services.extraction import (
    validate_input_file,
)
from app.services.keywords import extract_keywords, generate_search_queries
from app.services.offline_source_provider import OfflineSourceProvider
from app.services.source_deduplication import deduplicate_sources
from app.services.search_cache import SearchCache
from app.services.paragraph_matching import match_paragraphs
from app.services.ai_risk import estimate_ai_risk
from app.services.report_generator import generate_report

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
async def health_check_main():
    return {"status": "ok", "service": "academic_suite_backend"}


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


# ------------------------------------------------------------------
# Orchestration Endpoint (Hour 4)
# ------------------------------------------------------------------

@app.post("/api/v1/scans")
async def create_scan_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
    pasted_text: Optional[str] = Form(None),
    payload: dict = Depends(verify_jwt_token),
):
    try:
        if not file and not pasted_text:
            return JSONResponse(
                status_code=400,
                content={"error": {"code": "NO_INPUT", "message": "Must provide either 'file' or 'pasted_text'."}}
            )

        # 1. Document Ingestion
        try:
            if file:
                file_bytes = await file.read()
                validate_input_file(file.filename, file_bytes)
                extracted_text = extract_document(file.filename, file_bytes)
                filename = file.filename
                file_type = file.filename.split(".")[-1].lower() if "." in file.filename else "unknown"
            else:
                extracted_text = extract_pasted_text(pasted_text)
                filename = "pasted_text.txt"
                file_type = "txt"
        except IngestionError as e:
            return JSONResponse(
                status_code=400,
                content={"error": {"code": "INGESTION_ERROR", "message": str(e), "details": {}}}
            )

        cleaned_text = clean_and_normalize_text(extracted_text)
        document_hash = generate_document_hash(cleaned_text)
        word_count = len(cleaned_text.split())
        character_count = len(cleaned_text)

        # 2. Cache Lookup
        redis_url = None
        try:
            if settings.REDIS_URL and "localhost" not in settings.REDIS_URL:
                redis_url = settings.REDIS_URL
        except Exception as e:
            logger.warning(f"Cache initialization failed, falling back: {e}")
        cache = SearchCache(redis_url=redis_url)
        report_cache_key = cache.make_key(f"report:{settings.ANALYSIS_VERSION}", document_hash)
        
        cached_report = await cache.get(report_cache_key)
        if cached_report:
            # We must still create a new scan record for history
            scan_id = await create_scan(
                user_id=payload.get("sub", "anonymous"),
                document_hash=document_hash,
                filename=filename,
                file_type=file_type,
                raw_text=extracted_text,
                cleaned_text=cleaned_text,
                word_count=word_count,
                character_count=character_count,
            )
            # Duplicate the report for this new scan_id
            report_data = cached_report.get("report", cached_report)
            report_data["scan_id"] = scan_id
            
            await save_scan_report(
                scan_id=scan_id,
                similarity_percentage=report_data["similarity_percentage"],
                originality_percentage=report_data["originality_percentage"],
                similarity_risk_level=report_data["similarity_risk_level"],
                ai_risk_score=report_data["ai_content_risk"]["risk_score"],
                ai_risk_level=report_data["ai_content_risk"]["risk_level"],
                report_json=report_data
            )
            return {
                "scan_id": scan_id,
                "cache_hit": True,
                "processing_mode": "offline",
                "document": {
                    "filename": filename,
                    "file_type": file_type,
                    "word_count": word_count,
                    "character_count": character_count,
                    "document_hash": document_hash
                },
                "report": report_data
            }

        # 3. Create Scan Record
        scan_id = await create_scan(
            user_id=payload.get("sub", "anonymous"),
            document_hash=document_hash,
            filename=filename,
            file_type=file_type,
            raw_text=extracted_text,
            cleaned_text=cleaned_text,
            word_count=word_count,
            character_count=character_count,
        )

        # 4. Keyword Extraction & Source Retrieval
        keywords = extract_keywords(cleaned_text)
        provider = OfflineSourceProvider()
        raw_sources = provider.search(keywords)
        unique_sources = deduplicate_sources(raw_sources)
        
        # 5. Source Persistence
        sources = []
        for src in unique_sources:
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
            sources.append(src)

        # 6 & 7. Paragraph Matching
        matched_paragraphs = match_paragraphs(cleaned_text, sources)

        # 8. AI Content Risk Estimate
        ai_risk_data = estimate_ai_risk(cleaned_text)

        # 9. Report Generation
        search_mode = settings.SCHOLARLY_SEARCH_MODE
        report = generate_report(
            scan_id=scan_id,
            document_word_count=word_count,
            matched_paragraphs=matched_paragraphs,
            ai_risk_data=ai_risk_data,
            sources=sources,
            search_mode=search_mode,
            cache_stats=cache.stats
        )

        # 10. History/Report Persistence
        matches_to_save = []
        for m in matched_paragraphs:
            matches_to_save.append({
                "scan_id": scan_id,
                "source_id": m["source_id"],
                "paragraph_index": m["paragraph_index"],
                "document_excerpt": m["document_excerpt"],
                "matched_excerpt": m["matched_excerpt"],
                "similarity_score": m["similarity_score"]
            })
        await save_scan_matches(matches_to_save)
        
        await save_scan_report(
            scan_id=scan_id,
            similarity_percentage=report["similarity_percentage"],
            originality_percentage=report["originality_percentage"],
            similarity_risk_level=report["similarity_risk_level"],
            ai_risk_score=ai_risk_data["risk_score"],
            ai_risk_level=ai_risk_data["risk_level"],
            report_json=report
        # Cache the report
        try:
            await cache.set(report_cache_key, {"report": report}, ttl=settings.REPORT_CACHE_TTL_SECONDS)
        except Exception as e:
            logger.warning(f"Failed to set cache for scan report: {e}")

        return {
            "scan_id": scan_id,
            "cache_hit": False,
            "processing_mode": "offline",
            "document": {
                "filename": filename,
                "file_type": file_type,
                "word_count": word_count,
                "character_count": character_count,
                "document_hash": document_hash
            },
            "report": report
        }
    except Exception:
        logger.exception("Orchestration endpoint failed.")
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred.", "details": {}}}
        )

# ------------------------------------------------------------------
# History Endpoint (Hour 4)
# ------------------------------------------------------------------

@app.get("/api/v1/history")
async def get_history_endpoint(
    request: Request,
    payload: dict = Depends(verify_jwt_token),
):
    user_id = payload.get("sub", "anonymous")
    async with AsyncSessionLocal() as session:
        # Join Scan and ScanReport to get history
        stmt = (
            select(Scan, ScanReport)
            .join(ScanReport, Scan.id == ScanReport.scan_id)
            .where(Scan.user_id == user_id)
            .order_by(Scan.created_at.desc())
        )
        result = await session.execute(stmt)
        rows = result.all()
        
        history = []
        for scan, report in rows:
            history.append({
                "scan_id": scan.id,
                "filename": scan.filename,
                "similarity_percentage": report.similarity_percentage,
                "originality_percentage": report.originality_percentage,
                "ai_risk_level": report.ai_risk_level,
                "created_at": scan.created_at.isoformat(),
                "processing_mode": "offline"
            })
            
        return {"history": history}

# ------------------------------------------------------------------
# DELETE History Endpoint
# ------------------------------------------------------------------
@app.delete("/api/v1/history/{scan_id}")
async def delete_history_endpoint(
    scan_id: str,
    request: Request,
    payload: dict = Depends(verify_jwt_token),
):
    scan = await get_scan_by_id(scan_id)
    if not scan or scan.user_id != payload.get("sub", "anonymous"):
        raise HTTPException(status_code=404, detail="Scan not found.")
        
    await delete_scan_report(scan_id)
    return {"status": "success", "message": "History deleted."}

# ------------------------------------------------------------------
# Analysis Endpoint
# ------------------------------------------------------------------


@app.post("/api/v1/scans/{scan_id}/analyze")
async def analyze_scan_endpoint(
    scan_id: str,
    request: Request,
    payload: dict = Depends(verify_jwt_token),
):
    scan = await get_scan_by_id(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    if not scan.cleaned_text:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "NO_EXTRACTABLE_TEXT",
                    "message": "The document contains no analysable text.",
                    "details": {},
                }
            },
        )

    # Check for a valid cached report
    redis_url = None
    try:
        if settings.REDIS_URL and "localhost" not in settings.REDIS_URL:
            redis_url = settings.REDIS_URL
    except Exception:
        logger.warning("Failed to initialize Redis URL, falling back to default cache.")

    cache = SearchCache(redis_url=redis_url)
    report_cache_key = cache.make_key(
        f"report:{settings.ANALYSIS_VERSION}", scan.document_hash
    )

    cached_report = await cache.get(report_cache_key)
    if cached_report:
        # Re-attach the current scan_id in case it's a different upload of the same file
        cached_report["scan_id"] = scan_id
        if "report" in cached_report:
            cached_report["report"]["scan_id"] = scan_id
        return {
            "scan_id": scan_id,
            "cache_hit": True,
            "report": cached_report.get("report", cached_report),
        }

    # Retrieve sources
    db_sources = await get_sources_by_scan_id(scan_id)
    sources = []

    if not db_sources:
        # Run offline source retrieval
        keywords = extract_keywords(scan.cleaned_text)
        provider = OfflineSourceProvider()
        raw_sources = provider.search(keywords)
        unique_sources = deduplicate_sources(raw_sources)
        for src in unique_sources:
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
            sources.append(src)
    else:
        for s in db_sources:
            sources.append(
                {
                    "provider_id": s.provider_id,
                    "title": s.title,
                    "abstract": s.abstract,
                }
            )

    # Run paragraph matching (which computes TF-IDF similarity internally for paragraphs)
    matched_paragraphs = match_paragraphs(scan.cleaned_text, sources)

    # Run AI-content risk estimation
    ai_risk_data = estimate_ai_risk(scan.cleaned_text)

    # Generate combined report
    search_mode = settings.SCHOLARLY_SEARCH_MODE
    report = generate_report(
        scan_id=scan_id,
        document_word_count=scan.word_count,
        matched_paragraphs=matched_paragraphs,
        ai_risk_data=ai_risk_data,
        sources=sources,
        search_mode=search_mode,
        cache_stats=cache.stats,
    )

    # Persist matches
    matches_to_save = []
    for m in matched_paragraphs:
        matches_to_save.append(
            {
                "scan_id": scan_id,
                "source_id": m["source_id"],
                "paragraph_index": m["paragraph_index"],
                "document_excerpt": m["document_excerpt"],
                "matched_excerpt": m["matched_excerpt"],
                "similarity_score": m["similarity_score"],
            }
        )
    await save_scan_matches(matches_to_save)

    # Persist report
    await save_scan_report(
        scan_id=scan_id,
        similarity_percentage=report["similarity_percentage"],
        originality_percentage=report["originality_percentage"],
        similarity_risk_level=report["similarity_risk_level"],
        ai_risk_score=ai_risk_data["risk_score"],
        ai_risk_level=ai_risk_data["risk_level"],
        report_json=report,
    )

    # Cache the report
    try:
        await cache.set(
            report_cache_key, {"report": report}, ttl=settings.REPORT_CACHE_TTL_SECONDS
        )
    except Exception as exc:
        logger.warning("Failed to cache report: %s", exc)

    return {"scan_id": scan_id, "cache_hit": False, "report": report}


@app.get("/api/v1/scans/{scan_id}/report")
async def get_scan_report_endpoint(
    scan_id: str,
    request: Request,
    payload: dict = Depends(verify_jwt_token),
):
    scan = await get_scan_by_id(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    report_record = await get_scan_report(scan_id)
    if not report_record:
        raise HTTPException(status_code=404, detail="Report not found for this scan.")

    return {
        "scan_id": scan_id,
        "cache_hit": True,  # It's from DB
        "report": report_record.report_json,
    }
