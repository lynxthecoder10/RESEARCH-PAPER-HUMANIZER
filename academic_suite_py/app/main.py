import logging
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Request, File, UploadFile, Form
from fastapi.responses import JSONResponse
from app.config import settings
from app.logger import logger
from middleware.auth_middleware import verify_jwt_token
from middleware.exception_handler import register_exception_handlers
from app.services.extraction import extract_document, extract_pasted_text, IngestionError
from app.services.cleaning import clean_and_normalize_text
from app.services.hashing import generate_document_hash
from app.db import initialize_database, get_scan_by_hash, create_scan

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
async def protected_endpoint(request: Request, payload: dict = Depends(verify_jwt_token)):
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
    payload: dict = Depends(verify_jwt_token)
):
    try:
        # Validate inputs
        if file is None and pasted_text is None:
            raise IngestionError(
                "VALIDATION_ERROR",
                "Either file or pasted_text must be provided.",
                400
            )
        if file is not None and pasted_text is not None:
            raise IngestionError(
                "VALIDATION_ERROR",
                "Provide either file or pasted_text, not both.",
                400
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
                "NO_EXTRACTABLE_TEXT",
                "The document contains no extractable text.",
                422
            )

        # Generate SHA-256 hash
        doc_hash = generate_document_hash(cleaned["cleaned_text"])

        # Check database for existing hash
        existing_scan = await get_scan_by_hash(doc_hash)
        
        # Build text preview
        preview = cleaned["cleaned_text"][:240].replace("\n", " ").strip()

        if existing_scan:
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
                    "text_preview": preview
                },
                "warnings": extraction["warnings"]
            }

        # Otherwise create a new scan record
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
            status="pending"
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
                "text_preview": preview
            },
            "warnings": extraction["warnings"]
        }

    except IngestionError as ie:
        return JSONResponse(
            status_code=ie.status_code,
            content={
                "error": {
                    "code": ie.code,
                    "message": ie.message,
                    "details": {}
                }
            }
        )
    except Exception as e:
        logger.error("Unhandled exception during document extraction", exc_info=e)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred during document extraction.",
                    "details": {}
                }
            }
        )
