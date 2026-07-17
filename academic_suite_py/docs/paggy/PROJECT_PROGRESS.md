# PAGGY Project Progress

## Project Information

- **Product**: PAGGY — Academic Integrity Platform
- **Parent Application**: Academic Suite
- **Target Architecture**: 80% Python FastAPI backend, 20% Next.js / React PWA frontend
- **Current Deadline**: Five-hour MVP completion sprint
- **Current Stage**: Stage 1 — Backend Foundation
- **Current Sprint**: Sprint 1
- **Overall Progress**: 15%
- **Last Updated**: 2026-07-17T21:40:00+05:30

## Progress Summary

| Stage | Objective | Status | Progress | Started | Completed | Blockers |
|---|---|---|---:|---|---|---|
| Stage 0 | Requirements and Planning | [x] Completed | 100% | 2026-07-16 | 2026-07-16 | None |
| Stage 1 | Backend Foundation | [~] In progress | 40% | 2026-07-16 | | Python 3.12 Host |
| Stage 2 | Document Ingestion | [ ] Not started | 0% | | | |
| Stage 3 | Keyword Extraction and Cache | [ ] Not started | 0% | | | |
| Stage 4 | Scholarly API Search | [ ] Not started | 0% | | | |
| Stage 5 | Similarity Analysis | [ ] Not started | 0% | | | |
| Stage 6 | AI Content Risk Analysis | [ ] Not started | 0% | | | |
| Stage 7 | Combined Report Generation | [ ] Not started | 0% | | | |
| Stage 8 | Frontend Integration | [ ] Not started | 0% | | | |
| Stage 9 | Testing and Security | [ ] Not started | 0% | | | |
| Stage 10 | Deployment and Demonstration | [ ] Not started | 0% | | | |

---

## Stage 0 — Requirements and Planning
- **Objective**: Establish the architecture and design schema.
- **Architecture involved**: High-level next.js <-> FastAPI diagram.
- **Dependencies**: None.
- **Files created**: `docs/architecture.md`, `docs/database_schema.md`.
- **Files modified**: None.
- **Endpoints added**: None.
- **Database changes**: Proposed relational schema designed.
- **Implementation steps**: Draft architecture and DB diagram.
- **Tests executed**: None.
- **Status**: [x] Completed (100%)

## Stage 1 — Backend Foundation
- **Objective**: Dockerizing python environment, caching setup, and JWT token authentication.
- **Architecture involved**: FastAPI middleware and caching layer.
- **Dependencies**: poetry, python-jose, redis, aiosqlite, pytest.
- **Files created**: `cache/base.py`, `cache/sqlite_cache.py`, `cache/redis_cache.py`, `middleware/auth_middleware.py`, `middleware/exception_handler.py`.
- **Files modified**: `Dockerfile`, `requirements.txt`.
- **Endpoints added**: `GET /api/protected`, `GET /health`.
- **Database changes**: SQLite Cache table created on execution.
- **Current blockers**: Host has Python 3.14 only. We are using Docker with Python 3.12-slim.
- **Status**: [~] In progress (40%)
- **Next action**: Initialize local SQLite store database and write ingestion services.

---

## Five-Hour Sprint Timeline

### Hour 1 — Ingestion
- **Planned tasks**: Create SQLite database layer, extractors for PDF/DOCX/TXT/Pasted text, normalizer, and hashing service.
- **Completed tasks**: Reconstructed Docker 3.12 image config.
- **Unfinished tasks**: SQLite persistence, extraction, cleaning, hashing, endpoints.
- **Files changed**: `Dockerfile`
- **Decisions made**: Running testing inside Docker.
- **Next-hour priority**: Complete extraction, ingestion services, endpoints, and write tests.

### Hour 2 — Scholarly Search
- **Planned tasks**: Keyword extraction, concurrent scholarly search (Semantic Scholar, OpenAlex, Crossref), and deduplication.
- **Completed tasks**: None.
- **Next-hour priority**: Connect APIs with httpx.

### Hour 3 — Similarity and AI Risk
- **Planned tasks**: TF-IDF, cosine similarity, paragraph matching, and statistical AI risk evaluation.
- **Completed tasks**: None.
- **Next-hour priority**: Perform scikit-learn comparisons.

### Hour 4 — API and Frontend Integration
- **Planned tasks**: Combined scan endpoint and Next.js routes proxying.
- **Completed tasks**: None.
- **Next-hour priority**: Wire React UI to FastAPI.

### Hour 5 — Testing, Demo, and Stabilization
- **Planned tasks**: Run end-to-end tests and manual demo.
- **Completed tasks**: None.
- **Next-hour priority**: Complete verification and create Sprint tag.

---

## Feature Matrix

| Feature | Backend | Frontend | Tests | Demo Ready | Status |
|---|---|---|---|---|---|
| PDF upload | [ ] | [x] | [ ] | [ ] | Staged |
| DOCX upload | [ ] | [x] | [ ] | [ ] | Staged |
| TXT upload | [ ] | [x] | [ ] | [ ] | Staged |
| pasted text | [ ] | [x] | [ ] | [ ] | Staged |
| file validation | [ ] | [x] | [ ] | [ ] | Staged |
| text extraction | [ ] | [ ] | [ ] | [ ] | Planned |
| text cleaning | [ ] | [ ] | [ ] | [ ] | Planned |
| SHA-256 hashing | [ ] | [x] | [ ] | [ ] | Planned |
| document cache | [ ] | [ ] | [ ] | [ ] | Planned |
| keyword extraction | [ ] | [ ] | [ ] | [ ] | Planned |
| Semantic Scholar | [ ] | [ ] | [ ] | [ ] | Planned |
| OpenAlex | [ ] | [ ] | [ ] | [ ] | Planned |
| Crossref | [ ] | [ ] | [ ] | [ ] | Planned |
| DOI deduplication | [ ] | [ ] | [ ] | [ ] | Planned |
| TF-IDF | [ ] | [ ] | [ ] | [ ] | Planned |
| cosine similarity | [ ] | [ ] | [ ] | [ ] | Planned |
| paragraph matching | [ ] | [ ] | [ ] | [ ] | Planned |
| originality score | [ ] | [ ] | [ ] | [ ] | Planned |
| AI-content risk | [ ] | [ ] | [ ] | [ ] | Planned |
| combined report | [ ] | [ ] | [ ] | [ ] | Planned |
| scan history | [ ] | [x] | [ ] | [ ] | Staged |
| PWA interface | [ ] | [x] | [ ] | [ ] | Staged |
| frontend/backend connection | [ ] | [ ] | [ ] | [ ] | Planned |
| Docker deployment | [x] | [ ] | [ ] | [ ] | Staged |
| GitHub synchronization | [x] | [ ] | [ ] | [ ] | Staged |
