import uuid
import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import Column, String, Integer, DateTime, Text, Index, ForeignKey
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.future import select
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
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    history = relationship("ScanHistory", back_populates="scan", cascade="all, delete-orphan", lazy="selectin")

class ScanHistory(Base):
    __tablename__ = "scan_history"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(String, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)
    event_message = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    scan = relationship("Scan", back_populates="history")

# Process DATABASE_URL to ensure it is async-compatible
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite://") and not db_url.startswith("sqlite+aiosqlite://"):
    db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://")

# Target paggy.db as per instruction
if "dev.db" in db_url:
    db_url = db_url.replace("dev.db", "paggy.db")

engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def initialize_database() -> None:
    async with engine.begin() as conn:
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
    status: str = "pending"
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
                status=status
            )
            session.add(scan)
            # Add initial history event
            history = ScanHistory(
                id=str(uuid.uuid4()),
                scan_id=scan.id,
                event_type="created",
                event_message="Scan record initialized."
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
        result = await session.execute(select(Scan).where(Scan.document_hash == document_hash))
        return result.scalars().first()

async def update_scan_status(scan_id: str, status: str, event_message: Optional[str] = None) -> Optional[Scan]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalars().first()
            if not scan:
                return None
            scan.status = status
            scan.updated_at = datetime.datetime.utcnow()
            if event_message:
                history = ScanHistory(
                    id=str(uuid.uuid4()),
                    scan_id=scan.id,
                    event_type="status_change",
                    event_message=event_message
                )
                session.add(history)
        await session.refresh(scan)
        return scan

async def add_history_event(scan_id: str, event_type: str, event_message: str) -> Optional[ScanHistory]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            history = ScanHistory(
                id=str(uuid.uuid4()),
                scan_id=scan_id,
                event_type=event_type,
                event_message=event_message
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
