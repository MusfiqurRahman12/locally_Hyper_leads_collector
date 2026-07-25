from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, Any, TYPE_CHECKING
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB

if TYPE_CHECKING:
    from app.models.scan import Scan


class AuditResultType(str):
    SEO = "SEO"
    PERFORMANCE = "PERFORMANCE"
    SECURITY = "SECURITY"
    TECHNOLOGY = "TECHNOLOGY"
    MARKETING = "MARKETING"
    SOCIAL = "SOCIAL"
    UX = "UX"
    REPUTATION = "REPUTATION"
    WEBSITE_PAGES = "WEBSITE_PAGES"
    CONTACT = "CONTACT"


class AuditResult(SQLModel, table=True):
    __tablename__ = "audit_results"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    scan_id: UUID = Field(foreign_key="scans.id", index=True)
    prospect_id: UUID = Field(foreign_key="prospects.id", index=True)

    result_type: str = Field(index=True)  # SEO, PERFORMANCE, SECURITY, etc.
    score: Optional[int] = None  # 0–100 category score (lower = worse)
    data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    findings: Optional[list] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    scan: Optional["Scan"] = Relationship(back_populates="audit_results")


class AuditResultRead(SQLModel):
    id: UUID
    scan_id: UUID
    result_type: str
    score: Optional[int]
    data: Optional[dict]
    findings: Optional[list]
    created_at: datetime
