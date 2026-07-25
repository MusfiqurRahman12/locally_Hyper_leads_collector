from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum
import sqlalchemy as sa

if TYPE_CHECKING:
    from app.models.prospect import Prospect
    from app.models.audit_result import AuditResult


class ScanStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Scan(SQLModel, table=True):
    __tablename__ = "scans"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    prospect_id: UUID = Field(foreign_key="prospects.id", index=True)
    status: ScanStatus = Field(default=ScanStatus.PENDING, index=True)

    # Progress tracking
    current_stage: Optional[str] = None
    progress_pct: int = Field(default=0)
    error_message: Optional[str] = None

    # Celery task ID
    task_id: Optional[str] = None

    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Relationships
    prospect: Optional["Prospect"] = Relationship(back_populates="scans")
    audit_results: List["AuditResult"] = Relationship(back_populates="scan")


class ScanCreate(SQLModel):
    prospect_id: UUID


class ScanRead(SQLModel):
    id: UUID
    prospect_id: UUID
    status: ScanStatus
    current_stage: Optional[str]
    progress_pct: int
    error_message: Optional[str]
    triggered_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
