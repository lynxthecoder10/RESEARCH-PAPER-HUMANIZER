import uuid
import datetime
from typing import List, Optional
from sqlalchemy import (
    Column,
    String,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    JSON,
    Float,
    delete,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.future import select
import json
from app.config import settings

Base = declarative_base()


class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    file_type = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    document_hash = Column(String, nullable=False, index=True)
    original_text = Column(Text, nullable=False)
    cleaned_text = Column(Text, nullable=False)
    character_count = Column(Integer, nullable=False)
    word_count = Column(Integer, nullable=False)
    page_count = Column(Integer, nullable=False, default=0)
    paragraph_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )

    history = relationship(
        "ScanHistory",
        back_populates="scan",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(String, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)
    event_message = Column(String, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    scan = relationship("Scan", back_populates="history")


# New model: ScanSource
class ScanSource(Base):
    __tablename__ = "scan_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(
        String, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider = Column(String, nullable=False)
    provider_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    abstract = Column(Text, nullable=True)
    authors_json = Column(Text, nullable=True)  # JSON-encoded list
    doi = Column(String, nullable=True, index=True)
    publication_year = Column(Integer, nullable=True)
    venue = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    open_access_url = Column(String, nullable=True)
    citation_count = Column(Integer, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    scan = relationship("Scan", backref="sources")


class ScanMatch(Base):
    __tablename__ = "scan_matches"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(
        String, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id = Column(String, nullable=False, index=True)
    paragraph_index = Column(Integer, nullable=False)
    document_excerpt = Column(Text, nullable=False)
    matched_excerpt = Column(Text, nullable=False)
    similarity_score = Column(Float, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )


class ScanReport(Base):
    __tablename__ = "scan_reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(
        String,
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )
    similarity_percentage = Column(Float, nullable=False)
    originality_percentage = Column(Float, nullable=False)
    similarity_risk_level = Column(String, nullable=False)
    ai_risk_score = Column(Float, nullable=False)
    ai_risk_level = Column(String, nullable=False)
    report_json = Column(JSON, nullable=False)
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )


# New model: ApiCache
class ApiCache(Base):
    __tablename__ = "api_cache"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    cache_key = Column(String, nullable=False, unique=True, index=True)
    provider = Column(String, nullable=False)
    query = Column(String, nullable=False)
    response_json = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )


# Helper functions for ScanSource
async def create_scan_source(
    scan_id: str,
    provider: str,
    provider_id: str,
    title: str,
    abstract: Optional[str] = None,
    authors: Optional[list] = None,
    doi: Optional[str] = None,
    publication_year: Optional[int] = None,
    venue: Optional[str] = None,
    source_url: Optional[str] = None,
    open_access_url: Optional[str] = None,
    citation_count: Optional[int] = None,
) -> ScanSource:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            source = ScanSource(
                scan_id=scan_id,
                provider=provider,
                provider_id=provider_id,
                title=title,
                abstract=abstract,
                authors_json=json.dumps(authors) if authors else None,
                doi=doi,
                publication_year=publication_year,
                venue=venue,
                source_url=source_url,
                open_access_url=open_access_url,
                citation_count=citation_count,
            )
            session.add(source)
        await session.refresh(source)
        return source


# Helper to get sources by scan_id
async def get_sources_by_scan_id(scan_id: str) -> List[ScanSource]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ScanSource).where(ScanSource.scan_id == scan_id)
        )
        return list(result.scalars().all())


async def save_scan_matches(matches: List[dict]) -> None:
    if not matches:
        return
    async with AsyncSessionLocal() as session:
        async with session.begin():
            for match in matches:
                session.add(
                    ScanMatch(
                        scan_id=match["scan_id"],
                        source_id=match["source_id"],
                        paragraph_index=match["paragraph_index"],
                        document_excerpt=match["document_excerpt"],
                        matched_excerpt=match["matched_excerpt"],
                        similarity_score=match["similarity_score"],
                    )
                )


async def get_scan_matches(scan_id: str) -> List[ScanMatch]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ScanMatch)
            .where(ScanMatch.scan_id == scan_id)
            .order_by(ScanMatch.paragraph_index)
        )
        return list(result.scalars().all())


async def save_scan_report(
    scan_id: str,
    similarity_percentage: float,
    originality_percentage: float,
    similarity_risk_level: str,
    ai_risk_score: float,
    ai_risk_level: str,
    report_json: dict,
) -> ScanReport:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                delete(ScanReport).where(ScanReport.scan_id == scan_id)
            )
            report = ScanReport(
                scan_id=scan_id,
                similarity_percentage=similarity_percentage,
                originality_percentage=originality_percentage,
                similarity_risk_level=similarity_risk_level,
                ai_risk_score=ai_risk_score,
                ai_risk_level=ai_risk_level,
                report_json=report_json,
            )
            session.add(report)
        await session.refresh(report)
        return report


async def get_scan_report(scan_id: str) -> Optional[ScanReport]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ScanReport).where(ScanReport.scan_id == scan_id)
        )
        return result.scalars().first()


async def delete_scan_report(scan_id: str) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                delete(ScanReport).where(ScanReport.scan_id == scan_id)
            )


# Helper functions for ApiCache
async def upsert_api_cache(
    cache_key: str,
    provider: str,
    query: str,
    response_json: str,
    ttl_seconds: int = 86400,
) -> ApiCache:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            now = datetime.datetime.now(datetime.timezone.utc)
            expires = now + datetime.timedelta(seconds=ttl_seconds)
            result = await session.execute(
                select(ApiCache).where(ApiCache.cache_key == cache_key)
            )
            cache = result.scalars().first()
            if cache:
                cache.provider = provider
                cache.query = query
                cache.response_json = response_json
                cache.expires_at = expires
                cache.updated_at = now
            else:
                cache = ApiCache(
                    cache_key=cache_key,
                    provider=provider,
                    query=query,
                    response_json=response_json,
                    expires_at=expires,
                )
                session.add(cache)
        await session.refresh(cache)
        return cache


async def get_api_cache(cache_key: str) -> Optional[ApiCache]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ApiCache).where(ApiCache.cache_key == cache_key)
        )
        cache = result.scalars().first()
        if cache and cache.expires_at > datetime.datetime.now(datetime.timezone.utc):
            return cache
        return None


# Process DATABASE_URL to ensure it is async-compatible
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite://") and not db_url.startswith("sqlite+aiosqlite://"):
    db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://")

# Target paggy.db as per instruction
if "dev.db" in db_url:
    db_url = db_url.replace("dev.db", "paggy.db")

engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def initialize_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


async def create_scan(
    user_id: Optional[str],
    filename: Optional[str],
    file_type: str,
    mime_type: Optional[str],
    document_hash: str,
    original_text: str,
    cleaned_text: str,
    character_count: int,
    word_count: int,
    page_count: int = 0,
    paragraph_count: int = 0,
    status: str = "pending",
) -> Scan:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            scan = Scan(
                id=str(uuid.uuid4()),
                user_id=user_id,
                filename=filename,
                file_type=file_type,
                mime_type=mime_type,
                document_hash=document_hash,
                original_text=original_text,
                cleaned_text=cleaned_text,
                character_count=character_count,
                word_count=word_count,
                page_count=page_count,
                paragraph_count=paragraph_count,
                status=status,
            )
            session.add(scan)
            # Add initial history event
            history = ScanHistory(
                id=str(uuid.uuid4()),
                scan_id=scan.id,
                event_type="created",
                event_message="Scan record initialized.",
            )
            session.add(history)
        await session.refresh(scan)
        return scan


async def get_scan_by_id(scan_id: str) -> Optional[Scan]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Scan).where(Scan.id == scan_id))
        return result.scalars().first()


async def get_scan_by_hash(document_hash: str) -> Optional[Scan]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Scan)
            .where(Scan.document_hash == document_hash)
            .order_by(Scan.created_at.desc())
        )
        return result.scalars().first()


async def update_scan_status(
    scan_id: str, status: str, event_message: Optional[str] = None
) -> Optional[Scan]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalars().first()
            if not scan:
                return None
            scan.status = status
            scan.updated_at = datetime.datetime.now(datetime.timezone.utc)
            if event_message:
                history = ScanHistory(
                    id=str(uuid.uuid4()),
                    scan_id=scan.id,
                    event_type="status_change",
                    event_message=event_message,
                )
                session.add(history)
        await session.refresh(scan)
        return scan


async def add_history_event(
    scan_id: str, event_type: str, event_message: str
) -> Optional[ScanHistory]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            history = ScanHistory(
                id=str(uuid.uuid4()),
                scan_id=scan_id,
                event_type=event_type,
                event_message=event_message,
            )
            session.add(history)
        return history


async def list_recent_scans(user_id: str, limit: int = 20) -> List[Scan]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Scan)
            .where(Scan.user_id == user_id)
            .order_by(Scan.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


async def delete_scan(scan_id: str) -> bool:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalars().first()
            if not scan:
                return False
            await session.delete(scan)
        return True
