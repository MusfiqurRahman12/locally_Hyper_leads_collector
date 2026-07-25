"""
Search & Discovery endpoints – find businesses via OpenStreetMap.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.session import get_session
from app.models.prospect import Prospect, ProspectCreate
from app.services.discovery.overpass_api import (
    search_businesses,
    geocode_address,
    reverse_geocode,
    get_available_categories,
)

router = APIRouter()


class SearchRequest(BaseModel):
    # Location (one of these groups is required)
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None  # city, state or full address
    radius_km: float = Field(default=5.0, ge=0.1, le=50.0)

    # Filters
    category: str = Field(default="general")
    keyword: Optional[str] = None
    max_results: int = Field(default=100, ge=1, le=500)


class SearchResponse(BaseModel):
    total: int
    prospects_created: int
    prospects_existing: int
    lat: float
    lng: float
    radius_km: float
    category: str
    location_name: Optional[str]


class GeocodeRequest(BaseModel):
    address: str


@router.post("/search", response_model=SearchResponse)
async def search_prospects(
    request: SearchRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """
    Discover businesses in an area using OpenStreetMap.
    Creates prospect records for new businesses found.
    """
    lat = request.lat
    lng = request.lng
    location_name = None

    # Resolve address → lat/lng if needed
    if not lat or not lng:
        if not request.address:
            raise HTTPException(status_code=400, detail="Either lat/lng or address is required.")
        coords = await geocode_address(request.address)
        if not coords:
            raise HTTPException(
                status_code=404,
                detail=f"Could not geocode address: '{request.address}'. Try a more specific location."
            )
        lat, lng = coords

    # Get location name for response
    geo_info = await reverse_geocode(lat, lng)
    location_name = geo_info.get("display_name")

    radius_meters = request.radius_km * 1000

    # Fetch businesses from OSM
    businesses = await search_businesses(
        lat=lat,
        lng=lng,
        radius_meters=radius_meters,
        category=request.category,
        keyword=request.keyword,
        max_results=request.max_results,
    )

    if not businesses:
        return SearchResponse(
            total=0,
            prospects_created=0,
            prospects_existing=0,
            lat=lat, lng=lng,
            radius_km=request.radius_km,
            category=request.category,
            location_name=location_name,
        )

    # Upsert prospects into DB
    created = 0
    existing = 0

    for biz in businesses:
        # Check if already exists by place_id
        result = await session.exec(
            select(Prospect).where(Prospect.place_id == biz["place_id"])
        )
        existing_prospect = result.first()

        if existing_prospect:
            existing += 1
        else:
            # Flatten social_links into top-level
            prospect = Prospect(
                place_id=biz.get("place_id"),
                name=biz.get("name", "Unknown"),
                category=biz.get("category"),
                sub_categories=biz.get("sub_categories"),
                address=biz.get("address"),
                city=biz.get("city") or geo_info.get("city"),
                state=biz.get("state") or geo_info.get("state"),
                country=biz.get("country") or geo_info.get("country"),
                postal_code=biz.get("postal_code"),
                lat=biz.get("lat"),
                lng=biz.get("lng"),
                phone=biz.get("phone"),
                website=biz.get("website"),
                email=biz.get("email"),
                maps_url=biz.get("maps_url"),
                google_rating=biz.get("google_rating"),
                review_count=biz.get("review_count"),
                opening_hours=biz.get("opening_hours"),
                business_status=biz.get("business_status", "UNKNOWN"),
                description=biz.get("description"),
                social_links=biz.get("social_links"),
                data_source=biz.get("data_source", "openstreetmap"),
            )
            session.add(prospect)
            created += 1

    await session.commit()

    return SearchResponse(
        total=len(businesses),
        prospects_created=created,
        prospects_existing=existing,
        lat=lat, lng=lng,
        radius_km=request.radius_km,
        category=request.category,
        location_name=location_name,
    )


@router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """Convert an address string to lat/lng coordinates."""
    coords = await geocode_address(request.address)
    if not coords:
        raise HTTPException(status_code=404, detail=f"Could not geocode: {request.address}")
    lat, lng = coords
    geo_info = await reverse_geocode(lat, lng)
    return {"lat": lat, "lng": lng, "display_name": geo_info.get("display_name")}


@router.get("/categories")
async def get_categories():
    """Get list of supported business categories."""
    return {"categories": get_available_categories()}
