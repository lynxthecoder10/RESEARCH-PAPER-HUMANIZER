# PAGGY — Final Project Summary

## Project Title
PAGGY (Plagiarism and AI Guideline Guard for You) - MVP Release

## Problem Statement
Academic institutions and students face growing challenges in differentiating original scholarly work from plagiarized material and AI-generated content. Existing solutions are either fully proprietary black boxes, lack AI risk estimation, or require significant setup.

## Solution
PAGGY is a full-stack, Next.js + FastAPI solution integrating document ingestion, vector similarity, and AI content risk estimation. It operates seamlessly as a web app, Progressive Web App (PWA), and offers offline fallback scanning against synthetic datasets for secure, privacy-first scholarly review.

## Architecture
- **80% Python Architecture**: The core analysis engine (FastAPI) handles heavy data lifting, parsing (PDF/DOCX/TXT), cleaning, similarity (TF-IDF and Cosine Similarity), and AI risk modeling.
- **20% JavaScript Architecture**: The Next.js frontend functions as a thin presentation layer, providing routing, history, authentication proxying, and progressive web app capabilities without executing business logic.

## Major Modules
- **Ingestion Engine**: Extracts text from pasted strings, PDF, DOCX, and TXT files.
- **Search Cache**: SQLite/Redis hybrid for duplicate-scan prevention.
- **Retrieval Engine**: Uses TF-IDF to find matching academic sources from an offline synthetic corpus.
- **Similarity & Paragraph Matching**: Uses sliding window arrays and cosine similarity to map overlapping text.
- **AI Content Risk Estimate**: Heuristic detection of repetitive AI vocabulary and sentence uniformity.
- **Report Aggregation**: Merges results, limitations, and recommendations into a comprehensive JSON schema.

## UI Approach
- **Modern Glassmorphism**: Academic Suite’s dark mode and glass panels to display reports beautifully.
- **Progressive Web App**: Caches the application shell for installability, while keeping the privacy-sensitive analysis strictly server-side.

## Test Evidence
- **Backend**: 70/70 Pytest tests passing.
- **Frontend**: Clean ESLint, successful optimized Next.js production build.
- **Security**: 401 Unauthorized handling, clean Ruff/Black, Bandit approved.

## Limitations
- **Offline Corpus**: Currently uses a 20-document synthetic database. Does not search the live internet or global academic databases.
- **AI Estimation**: This is a statistical estimate, not a deterministic proof of AI generation. 

## Future Scope
- Integration with live scholarly APIs (Crossref, OpenAlex).
- Cloud Redis and PostgreSQL integration (Supabase).
- Advanced Transformer-based embeddings for semantic similarity.

## Conclusion
PAGGY provides a robust, extensible foundation for academic integrity scanning. The MVP proves the viability of splitting heavy Python analysis from light Next.js rendering, prioritizing speed, maintainability, and data security.
