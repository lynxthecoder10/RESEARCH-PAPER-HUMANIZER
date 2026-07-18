# PAGGY Demo Runbook

## Startup Commands
1. **Database & Cache**: 
   Since Docker is unavailable locally on the test machine, we rely on SQLite for the database and fallback local memory/sqlite caching.
2. **Backend**:
   `cd academic_suite_py && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
3. **Frontend**:
   `npm run dev`

## Required Environment Variables
- `DATABASE_URL` (SQLite URL `sqlite+aiosqlite:///./dev.db`)
- `JWT_AUDIENCE` (`authenticated`)
*(Supabase tokens and external APIs are omitted for this local MVP Demo).*

## Endpoints
- **Frontend URL**: `http://localhost:3000/plagiarism`
- **Backend Health**: `http://localhost:8000/health`

## Demo Walkthrough

### 1. Primary Pasted-Text Demo
- **Action**: Open the frontend URL.
- **Input**: Copy and paste the contents of `demo_fixtures/sample_text.txt`.
- **Result**: The UI will transition through 6 processing steps. 
- **Verification**: Ensure the final report renders with Similarity %, AI Content Risk Score, and Extracted Keywords.

### 2. PDF Demo
- **Action**: Click "Upload Document" and select `demo_fixtures/sample_paper.pdf`.
- **Input**: The frontend will display the filename and size.
- **Result**: Submit. The backend will extract text using PyPDF2.
- **Verification**: The report should match the extracted contents against the synthetic corpus.

### 3. Cache-Hit Demo
- **Action**: Without refreshing, paste the exact same text from step 1 and submit again.
- **Result**: The processing should complete almost instantaneously.
- **Verification**: The network payload will indicate `"cache_hit": true`.

### 4. History Demo
- **Action**: Scroll down to the "Your Recent Scans" panel.
- **Result**: You will see all previous scans listed by date and similarity score.
- **Verification**: Click "View Report" on an old scan to load it from the database, bypassing the scanner entirely.

### 5. Failure Recovery
- If the backend is unreachable, the Next.js proxy will timeout after 60s and return a 504 error, gracefully handled by the UI.

### Offline Corpus Disclaimer
**Note**: PAGGY MVP uses a bundled synthetic demonstration corpus containing 20 curated academic documents. Results do not represent exhaustive scholarly or internet-wide plagiarism coverage.
