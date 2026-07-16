# Architecture Overview

```mermaid
flowchart LR
    subgraph Frontend[React / Next.js Frontend]
        FE[UI Components]
    end
    subgraph Backend[Python FastAPI Backend]
        A[Authentication (Supabase JWT)] --> B[Document Extraction Engine]
        B --> C[Keyword Extraction Engine]
        C --> D[Similarity Engine]
        D --> E[AI Content Detection]
        E --> F[Report Generator]
        F --> G[Database Layer (SQLAlchemy)]
        G --> H[Supabase PostgreSQL]
        H --> I[Supabase Storage]
    end
    FE -->|REST API Calls| Backend
    Backend -->|Data & Files| I
    Backend -->|Metadata| H
    style Frontend fill:#f9f,stroke:#333,stroke-width:2px
    style Backend fill:#bbf,stroke:#333,stroke-width:2px
```

The diagram shows the thin React frontend communicating with the FastAPI backend via REST. The backend owns all business logic, interacts with Supabase services, and stores data in PostgreSQL while using Redis for caching.
