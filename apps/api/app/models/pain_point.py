from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime
from uuid import UUID, uuid4

if TYPE_CHECKING:
    from app.models.prospect import Prospect


class PainPoint(SQLModel, table=True):
    __tablename__ = "pain_points"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    prospect_id: UUID = Field(foreign_key="prospects.id", index=True)

    finding: str
    evidence: str
    business_impact: str
    priority: str  # HIGH / MEDIUM / LOW
    category: str  # audit category that triggered this
    scan_id: Optional[UUID] = Field(default=None, foreign_key="scans.id")

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    prospect: Optional["Prospect"] = Relationship(back_populates="pain_points")


class RecommendedService(SQLModel, table=True):
    __tablename__ = "recommended_services"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    prospect_id: UUID = Field(foreign_key="prospects.id", index=True)

    service: str  # e.g. "SEO", "Website Redesign"
    reason: str
    priority: str = "MEDIUM"
    scan_id: Optional[UUID] = Field(default=None, foreign_key="scans.id")

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    prospect: Optional["Prospect"] = Relationship(back_populates="recommended_services")
