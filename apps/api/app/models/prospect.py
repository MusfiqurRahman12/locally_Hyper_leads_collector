from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
from uuid import UUID, uuid4
import sqlalchemy as sa
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB

if TYPE_CHECKING:
    from app.models.scan import Scan
    from app.models.pain_point import PainPoint
    from app.models.recommended_service import RecommendedService


class ProspectBase(SQLModel):
    # Identity
    place_id: Optional[str] = Field(default=None, index=True)
    name: str = Field(index=True)

    # Category
    category: Optional[str] = Field(default=None, index=True)
    sub_categories: Optional[list] = Field(default=None, sa_column=Column(JSONB))

    # Location
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, index=True)
    state: Optional[str] = Field(default=None, index=True)
    country: Optional[str] = Field(default=None, index=True)
    postal_code: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    # Contact
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    maps_url: Optional[str] = None

    # Reviews
    google_rating: Optional[float] = None
    review_count: Optional[int] = None

    # Hours & Status
    opening_hours: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    business_status: Optional[str] = Field(default="UNKNOWN", index=True)

    # Additional info
    description: Optional[str] = None
    owner_name: Optional[str] = None
    year_established: Optional[str] = None

    # Social links (flat JSONB)
    social_links: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    contact_details: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    # Scoring
    lead_score: Optional[int] = Field(default=None, index=True)
    priority: Optional[str] = Field(default=None, index=True)  # HIGH/MEDIUM/LOW

    # Source tracking
    data_source: Optional[str] = Field(default="google_places")
    last_scan_date: Optional[datetime] = None


class Prospect(ProspectBase, table=True):
    __tablename__ = "prospects"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(sa.DateTime, onupdate=datetime.utcnow)
    )

    # Relationships
    scans: List["Scan"] = Relationship(back_populates="prospect")
    pain_points: List["PainPoint"] = Relationship(back_populates="prospect")
    recommended_services: List["RecommendedService"] = Relationship(back_populates="prospect")


class ProspectCreate(ProspectBase):
    pass


class ProspectRead(ProspectBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class ProspectList(SQLModel):
    id: UUID
    name: str
    category: Optional[str]
    city: Optional[str]
    state: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    google_rating: Optional[float]
    review_count: Optional[int]
    lead_score: Optional[int]
    priority: Optional[str]
    business_status: Optional[str]
    lat: Optional[float]
    lng: Optional[float]
    owner_name: Optional[str] = None
    contact_details: Optional[dict] = None
    last_scan_date: Optional[datetime]
